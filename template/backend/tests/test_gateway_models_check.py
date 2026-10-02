"""The gateway-models check sees each way to reach a model other than by a household box alias."""

import pytest

from tests.test_gateway_models import violations


@pytest.mark.parametrize(
    "source",
    [
        "import openai",
        "from anthropic import Anthropic",
        "from litellm.utils import token_counter",
        "MODEL = 'claude-sonnet-4-5'",
        "encoder = encoding_for_model('gpt-4')",
        "route = 'us.anthropic.claude-haiku-4-5'",
        "key = os.environ['OPENAI_API_KEY']",
        "class S(BaseSettings):\n    anthropic_api_key: SecretStr",
        "url = 'https://api.anthropic.com/v1/messages'",
        "decision_alias: str = 'goku/haiku'",
        "answer_model: str = Field(default='bedrock/sonnet', description='x')",
        "def ask(prompt: str, model: str = 'openai/sol') -> None: ...",
        "client.complete(model='ollama-cloud/kimi', prompt=p)",
        "body = {'model': 'gohan/opus'}",
        "declare_setting(Setting(key='x', type=SettingType.model_alias, default='vegeta/haiku', title='', description=''))",
    ],
)
def test_the_check_refuses(source: str) -> None:
    assert violations(source)


@pytest.mark.parametrize(
    "source",
    [
        "model: str = 'mimir/deep'",
        "EMBED_MODEL = 'titan/embed'",
        "reader_model = Field(default='atlas/voice-embed')",
        "triage = {'model': 'mimir/deep-greedy'}",
        "media_type = 'image/png'",
        "key = os.environ['LITELLM_API_KEY']",
        "tag = 'claude-code'",
        'def f() -> None:\n    """OPENAI_API_KEY"""',
        "from .openai import shape",
    ],
)
def test_the_check_passes(source: str) -> None:
    assert not violations(source)
