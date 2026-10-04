"""Authentication for every stakeholder in Workflow.md. See routes.py."""

from .models import Role, User  # noqa: F401  (registers the tables on Base)
from .routes import current_user, require_roles, router  # noqa: F401
