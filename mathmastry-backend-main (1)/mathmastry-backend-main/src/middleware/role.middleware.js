exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!roles.includes(req.user.role)) {
      // Show the actual required roles instead of hardcoded "Admin"
      const requiredRoles = roles.join(' or ');
      return res.status(403).json({
        error: `Access denied. This route requires ${requiredRoles} privileges.`,
      });
    }

    next();
  };
};