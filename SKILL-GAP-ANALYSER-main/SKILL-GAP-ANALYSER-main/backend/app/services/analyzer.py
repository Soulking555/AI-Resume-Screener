"""
Core analysis service — orchestrates PDF parsing, skill extraction,
gap detection, semantic scoring, and report generation.
"""

import os
import uuid
import time
import json
import csv
import numpy as np
from typing import List, Dict, Optional, Tuple
from datetime import datetime

from app.esco_taxonomy import esco_engine
from app.resume_parser import ResumePDFParser, SkillExtractor, ExtractedSkillMention
from app.nlp_models import model_registry
from app.schemas import (
    SkillMentionOut, SkillGapDetail, SimilarityScore,
    ModelMetrics, UpskillingStep, AnalysisResult
)

REPORTS_DIR = os.path.join(os.path.dirname(__file__), "..", "reports")
os.makedirs(REPORTS_DIR, exist_ok=True)

skill_extractor = SkillExtractor(esco_engine)


# ─────────────────────────────────────────────────────────────────────────────
def _gap_priority(skill_name: str, jd_explicit: List[str]) -> str:
    """Assign priority based on whether gap is in explicit JD requirements."""
    if skill_name in jd_explicit:
        return "critical"
    obj = esco_engine.get_skill(skill_name)
    if obj and obj.category in ("Cloud & DevOps", "AI & Data Science", "Software Architecture"):
        return "high"
    return "medium"


def _build_gap_detail(skill_name: str, jd_explicit: List[str],
                      triggered_by: Optional[List[str]] = None) -> SkillGapDetail:
    obj = esco_engine.get_skill(skill_name)
    return SkillGapDetail(
        skill=skill_name,
        category=obj.category if obj else "General",
        description=obj.description if obj else f"Competency in {skill_name}.",
        priority=_gap_priority(skill_name, jd_explicit),
        triggered_by=triggered_by,
    )


def _build_roadmap(explicit_gaps: List[str], implicit_gaps: List[str],
                   jd_explicit: List[str]) -> List[UpskillingStep]:
    roadmap: List[UpskillingStep] = []
    step = 1

    # Phase 1 — Close foundational implicit gaps
    for skill in implicit_gaps[:5]:
        obj = esco_engine.get_skill(skill)
        triggers = [req for req in jd_explicit
                    if skill in esco_engine.get_implicit_prerequisites([req])]
        roadmap.append(UpskillingStep(
            phase=1,
            skill=skill,
            skill_type="implicit",
            estimated_weeks="2–3 weeks",
            description=obj.description if obj else f"Foundational competency in {skill}.",
            triggered_by=triggers[:3],
        ))
        step += 1

    # Phase 2 — Mandatory explicit gaps
    for skill in explicit_gaps:
        obj = esco_engine.get_skill(skill)
        roadmap.append(UpskillingStep(
            phase=2,
            skill=skill,
            skill_type="explicit",
            estimated_weeks="3–4 weeks",
            description=obj.description if obj else f"Direct technology requirement: {skill}.",
            triggered_by=None,
        ))
        step += 1

    return roadmap


# ─────────────────────────────────────────────────────────────────────────────
async def analyze_resume(
    resume_text: str,
    jd_text: str,
    model_name: str = "Proposed Hybrid",
) -> AnalysisResult:
    """
    Full end-to-end skill gap analysis pipeline.
    """
    if not model_registry.is_loaded():
        raise RuntimeError("Models are not yet loaded. Please wait for model initialization.")

    model = model_registry.get_model(model_name)
    if model is None:
        raise ValueError(f"Unknown model: {model_name}")

    threshold = model_registry.get_threshold(model_name)

    # 1. Parse & segment resume
    sections = ResumePDFParser.segment_sections(resume_text)

    # 2. Extract candidate skills with context
    mentions: List[ExtractedSkillMention] = skill_extractor.extract_from_resume_sections(sections)
    cand_skills = [m.canonical_skill for m in mentions]
    cand_contexts = [m.context_window for m in mentions]

    # 3. Extract JD skills
    jd_explicit_raw = skill_extractor.extract_jd_skills(jd_text)
    jd_explicit = [s for s in jd_explicit_raw if s]  # filter None

    # 4. Compute normalized candidate-to-target cosine similarities.
    def encode_cosine_matrix(candidate_names, target_names):
        if not candidate_names or not target_names:
            return np.zeros((len(candidate_names), len(target_names)))
        try:
            candidate_embeddings = np.asarray(model.encode(candidate_names), dtype=np.float32)
            target_embeddings = np.asarray(model.encode(target_names), dtype=np.float32)
            candidate_norms = np.linalg.norm(candidate_embeddings, axis=1, keepdims=True)
            target_norms = np.linalg.norm(target_embeddings, axis=1, keepdims=True)
            candidate_embeddings = candidate_embeddings / np.clip(candidate_norms, 1e-9, None)
            target_embeddings = target_embeddings / np.clip(target_norms, 1e-9, None)
            return np.clip(candidate_embeddings @ target_embeddings.T, -1.0, 1.0)
        except Exception:
            return np.zeros((len(candidate_names), len(target_names)))

    explicit_cosine_mat = encode_cosine_matrix(cand_skills, jd_explicit)

    def match_by_cosine(target_names, cosine_matrix):
        matched = []
        gaps = []
        matched_scores = []
        if cosine_matrix.size == 0:
            return matched, list(target_names), matched_scores
        for j, target_name in enumerate(target_names):
            if j < cosine_matrix.shape[1]:
                best_i = int(np.argmax(cosine_matrix[:, j]))
                best_score = float(cosine_matrix[best_i, j])
                if best_score >= threshold:
                    matched.append(target_name)
                    matched_scores.append(best_score)
                else:
                    gaps.append(target_name)
        return matched, gaps, matched_scores

    matched_explicit, explicit_gap_names, matched_explicit_scores = match_by_cosine(
        jd_explicit, explicit_cosine_mat
    )

    # 5. Direct prerequisites are derived only for missing explicit skills.
    # This avoids the large, recursively-expanded prerequisite list.
    candidate_canonical_names = {
        (esco_engine.canonicalize(skill) or skill).lower()
        for skill in cand_skills
    }

    direct_prerequisites = []
    seen_prerequisites = set()
    for missing_skill in explicit_gap_names:
        skill_obj = esco_engine.get_skill(missing_skill)
        if not skill_obj:
            continue
        for prerequisite in skill_obj.implicit_prerequisites:
            prerequisite_key = prerequisite.lower()
            if prerequisite_key in seen_prerequisites:
                continue
            if prerequisite_key in candidate_canonical_names:
                continue
            seen_prerequisites.add(prerequisite_key)
            direct_prerequisites.append(prerequisite)

    # Keep the roadmap focused rather than flooding the UI with latent concepts.
    direct_prerequisites = direct_prerequisites[:8]
    jd_implicit = direct_prerequisites

    implicit_cosine_mat = encode_cosine_matrix(cand_skills, jd_implicit)
    matched_implicit, implicit_gap_names, _ = match_by_cosine(
        jd_implicit, implicit_cosine_mat
    )

    # 6. Emit the best actual cosine score for every explicit target skill.
    sim_scores: List[SimilarityScore] = []
    for j, jd_skill in enumerate(jd_explicit):
        if j < explicit_cosine_mat.shape[1]:
            best_i = int(np.argmax(explicit_cosine_mat[:, j]))
            score = float(explicit_cosine_mat[best_i, j])
            sim_scores.append(SimilarityScore(
                candidate_skill=cand_skills[best_i] if best_i < len(cand_skills) else "",
                jd_skill=jd_skill,
                score=round(score, 4),
                model=model_name,
            ))

    # 7. Coverage is the percentage of explicit target requirements cosine-matched.
    coverage_pct = round(
        len(matched_explicit) / max(len(jd_explicit), 1) * 100,
        1
    )

    # 8. Cosine mean is calculated only across successfully matched explicit skills.
    # This keeps it consistent with coverage and avoids lowering it by unrelated gaps.
    if matched_explicit_scores:
        overall_sim = round(float(np.mean(matched_explicit_scores)), 4)
    else:
        overall_sim = 0.0

    # 9. Build gap details
    explicit_gap_details = [
        _build_gap_detail(s, jd_explicit) for s in explicit_gap_names
    ]
    implicit_gap_details = []
    for s in implicit_gap_names:
        triggers = [req for req in explicit_gap_names
                    if esco_engine.get_skill(req)
                    and s in esco_engine.get_skill(req).implicit_prerequisites]
        implicit_gap_details.append(_build_gap_detail(s, jd_explicit, triggered_by=triggers[:3]))

    # 10. All model benchmark metrics
    all_metrics = model_registry.get_benchmark_metrics()
    metrics_out = [
        ModelMetrics(
            model=m["model"],
            accuracy=m["accuracy"],
            precision=m["precision"],
            recall=m["recall"],
            f1=m["f1"],
            explicit_gap_f1=m["explicit_gap_f1"],
            implicit_gap_discovery=m["implicit_gap_discovery"],
            latency_ms=m["latency_ms"],
            optimal_threshold=model_registry.get_threshold(m["model"]),
        )
        for m in all_metrics
    ]

    # 11. Upskilling roadmap
    roadmap = _build_roadmap(explicit_gap_names, implicit_gap_names, jd_explicit)

    # 12. Save report data
    report_id = str(uuid.uuid4())
    report_data = {
        "report_id": report_id,
        "timestamp": datetime.now().isoformat(),
        "model_used": model_name,
        "candidate_skills": cand_skills,
        "jd_explicit_skills": jd_explicit,
        "matched_skills": matched_explicit,
        "explicit_gaps": explicit_gap_names,
        "implicit_gaps": implicit_gap_names,
        "skill_coverage_pct": coverage_pct,
        "overall_similarity_score": overall_sim,
        "roadmap": [r.model_dump() for r in roadmap],
    }
    report_path = os.path.join(REPORTS_DIR, f"{report_id}.json")
    with open(report_path, "w") as f:
        json.dump(report_data, f, indent=2)

    # 13. Build output
    return AnalysisResult(
        resume_text_preview=resume_text[:500],
        jd_text_preview=jd_text[:500],
        model_used=model_name,
        candidate_skills=[
            SkillMentionOut(
                canonical_skill=m.canonical_skill,
                raw_mention=m.raw_mention,
                context_window=m.context_window[:120],
                section_source=m.section_source,
            )
            for m in mentions
        ],
        jd_explicit_skills=jd_explicit,
        jd_implicit_skills=jd_implicit,
        matched_skills=matched_explicit,
        explicit_gaps=explicit_gap_details,
        implicit_gaps=implicit_gap_details,
        skill_coverage_pct=coverage_pct,
        overall_similarity_score=overall_sim,
        similarity_scores=sim_scores,
        all_model_metrics=metrics_out,
        upskilling_roadmap=roadmap,
        report_id=report_id,
    )


# ─────────────────────────────────────────────────────────────────────────────
def generate_csv_report(report_id: str) -> str:
    """Generate a CSV report file from a saved analysis."""
    report_path = os.path.join(REPORTS_DIR, f"{report_id}.json")
    if not os.path.exists(report_path):
        raise FileNotFoundError(f"Report {report_id} not found.")

    with open(report_path) as f:
        data = json.load(f)

    csv_path = os.path.join(REPORTS_DIR, f"{report_id}.csv")
    with open(csv_path, "w", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(["AI Resume Skill Gap Analyzer — Analysis Report"])
        writer.writerow(["Report ID", data["report_id"]])
        writer.writerow(["Generated", data["timestamp"]])
        writer.writerow(["Model Used", data["model_used"]])
        writer.writerow(["Skill Coverage", f"{data['skill_coverage_pct']}%"])
        writer.writerow(["Overall Similarity", data["overall_similarity_score"]])
        writer.writerow([])

        writer.writerow(["CANDIDATE SKILLS"])
        writer.writerow(["Skill"])
        for s in data["candidate_skills"]:
            writer.writerow([s])

        writer.writerow([])
        writer.writerow(["JD EXPLICIT REQUIREMENTS"])
        writer.writerow(["Skill"])
        for s in data["jd_explicit_skills"]:
            writer.writerow([s])

        writer.writerow([])
        writer.writerow(["MATCHED SKILLS"])
        writer.writerow(["Skill"])
        for s in data["matched_skills"]:
            writer.writerow([s])

        writer.writerow([])
        writer.writerow(["EXPLICIT SKILL GAPS"])
        writer.writerow(["Skill"])
        for s in data["explicit_gaps"]:
            writer.writerow([s])

        writer.writerow([])
        writer.writerow(["IMPLICIT SKILL GAPS"])
        writer.writerow(["Skill"])
        for s in data["implicit_gaps"]:
            writer.writerow([s])

        writer.writerow([])
        writer.writerow(["UPSKILLING ROADMAP"])
        writer.writerow(["Phase", "Skill", "Type", "Estimated Time", "Description"])
        for step in data.get("roadmap", []):
            writer.writerow([
                step["phase"], step["skill"], step["skill_type"],
                step["estimated_weeks"], step["description"][:100]
            ])

    return csv_path


def generate_pdf_report(report_id: str) -> str:
    """Generate a professional PDF report using ReportLab."""
    from reportlab.lib.pagesizes import letter
    from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, HRFlowable
    from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
    from reportlab.lib import colors

    report_path = os.path.join(REPORTS_DIR, f"{report_id}.json")
    if not os.path.exists(report_path):
        raise FileNotFoundError(f"Report {report_id} not found.")

    with open(report_path) as f:
        data = json.load(f)

    pdf_path = os.path.join(REPORTS_DIR, f"{report_id}.pdf")
    doc = SimpleDocTemplate(pdf_path, pagesize=letter,
                            rightMargin=40, leftMargin=40, topMargin=40, bottomMargin=40)
    styles = getSampleStyleSheet()

    title_style = ParagraphStyle('T', fontName='Helvetica-Bold', fontSize=18,
                                  textColor=colors.HexColor('#1e3a5f'), leading=22)
    heading_style = ParagraphStyle('H', fontName='Helvetica-Bold', fontSize=13,
                                    textColor=colors.HexColor('#2563eb'), spaceBefore=12, spaceAfter=4)
    body_style = ParagraphStyle('B', fontName='Helvetica', fontSize=10,
                                 textColor=colors.HexColor('#374151'), leading=14)
    meta_style = ParagraphStyle('M', fontName='Helvetica', fontSize=9,
                                 textColor=colors.HexColor('#6b7280'), leading=12)

    story = []
    story.append(Paragraph("AI Resume Skill Gap Analyzer", title_style))
    story.append(Paragraph("Research-Grade Analysis Report", meta_style))
    story.append(HRFlowable(width="100%", thickness=2, color=colors.HexColor('#2563eb'), spaceBefore=6, spaceAfter=10))

    # Metadata table
    meta_table_data = [
        ["Report ID", data["report_id"][:16] + "..."],
        ["Generated", data["timestamp"][:19]],
        ["Model Used", data["model_used"]],
        ["Skill Coverage", f"{data['skill_coverage_pct']}%"],
        ["Overall Similarity", f"{data['overall_similarity_score']:.4f}"],
    ]
    meta_table = Table(meta_table_data, colWidths=[130, 350])
    meta_table.setStyle(TableStyle([
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica'),
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('TEXTCOLOR', (0, 0), (-1, -1), colors.HexColor('#374151')),
        ('ROWBACKGROUNDS', (0, 0), (-1, -1), [colors.HexColor('#f8fafc'), colors.white]),
        ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
        ('PADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(meta_table)
    story.append(Spacer(1, 12))

    def skill_section(title, skills, color):
        story.append(Paragraph(title, heading_style))
        if skills:
            rows = [skills[i:i+4] for i in range(0, len(skills), 4)]
            table = Table([[Paragraph(s, body_style) for s in row] for row in rows],
                          colWidths=[120] * 4)
            table.setStyle(TableStyle([
                ('BACKGROUND', (0, 0), (-1, -1), colors.HexColor(color)),
                ('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#e2e8f0')),
                ('PADDING', (0, 0), (-1, -1), 5),
            ]))
            story.append(table)
        else:
            story.append(Paragraph("None identified.", body_style))
        story.append(Spacer(1, 8))

    skill_section("✓ Matched Skills", data["matched_skills"], "#f0fdf4")
    skill_section("✗ Explicit Skill Gaps", data["explicit_gaps"], "#fef2f2")
    skill_section("⚠ Implicit Skill Gaps", data["implicit_gaps"], "#fffbeb")

    # Roadmap
    story.append(Paragraph("Personalized Upskilling Roadmap", heading_style))
    if data.get("roadmap"):
        roadmap_data = [["Phase", "Skill", "Type", "Est. Time"]]
        for step in data["roadmap"]:
            roadmap_data.append([
                f"Phase {step['phase']}",
                step["skill"],
                step["skill_type"].title(),
                step["estimated_weeks"],
            ])
        roadmap_table = Table(roadmap_data, colWidths=[70, 180, 80, 100])
        roadmap_table.setStyle(TableStyle([
            ('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#1e3a5f')),
            ('TEXTCOLOR', (0, 0), (-1, 0), colors.white),
            ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
            ('FONTSIZE', (0, 0), (-1, -1), 9),
            ('ROWBACKGROUNDS', (0, 1), (-1, -1), [colors.HexColor('#f8fafc'), colors.white]),
            ('GRID', (0, 0), (-1, -1), 0.5, colors.HexColor('#e2e8f0')),
            ('PADDING', (0, 0), (-1, -1), 6),
        ]))
        story.append(roadmap_table)

    doc.build(story)
    return pdf_path
