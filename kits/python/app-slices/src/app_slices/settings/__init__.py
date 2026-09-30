"""Runtime settings: declared in code where they are used, overridden by an operator on one page.

Mount: include `router(...)` in the app's API router and import `models` in
`db/registry.py`. Configure: `router`'s arguments. Add: `declare_setting` in an
`api/<domain>/settings.py`, read back with `get_value`. Design:
`docs/design/settings.md`.
"""

from app_slices.settings.declare import Setting, SettingType, declare_setting
from app_slices.settings.gateway_models import list_gateway_models
from app_slices.settings.routes import router
from app_slices.settings.service import RefusedValue, SettingsError, UndeclaredSetting, get_value

__all__ = [
    "RefusedValue",
    "Setting",
    "SettingType",
    "SettingsError",
    "UndeclaredSetting",
    "declare_setting",
    "get_value",
    "list_gateway_models",
    "router",
]
