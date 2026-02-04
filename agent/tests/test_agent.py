"""Tests for the AI agent."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch


@pytest.fixture
def mock_credentials():
    """Mock Azure credentials."""
    with patch("agent.DefaultAzureCredential") as mock:
        mock.return_value = AsyncMock()
        yield mock


@pytest.fixture  
def mock_provider():
    """Mock AzureAIAgentsProvider."""
    with patch("agent.AzureAIAgentsProvider") as mock:
        provider_instance = AsyncMock()
        mock.return_value = provider_instance
        yield provider_instance


@pytest.mark.asyncio
async def test_agent_not_available_without_endpoint():
    """Test agent returns unavailable message when endpoint not configured."""
    from agent import SkillsAgent
    
    with patch("agent.config") as mock_config:
        mock_config.azure_openai_endpoint = ""
        
        agent = SkillsAgent()
        result = await agent.initialize()
        
        assert result is False
        assert not agent.is_available


@pytest.mark.asyncio
async def test_agent_run_when_not_initialized():
    """Test agent returns error message when not initialized."""
    from agent import SkillsAgent
    
    agent = SkillsAgent()
    result = await agent.run("Who knows Python?")
    
    assert "not available" in result.lower()


@pytest.mark.asyncio
async def test_agent_instructions_contain_key_guidance():
    """Test agent instructions include necessary guidance."""
    from agent import AGENT_INSTRUCTIONS
    
    # Check that instructions cover key behaviors
    assert "find experts" in AGENT_INSTRUCTIONS.lower()
    assert "skill gaps" in AGENT_INSTRUCTIONS.lower()
    assert "L100" in AGENT_INSTRUCTIONS  # Proficiency levels
    assert "L400" in AGENT_INSTRUCTIONS


@pytest.mark.asyncio
async def test_agent_name_is_set():
    """Test agent has a proper name."""
    from agent import AGENT_NAME
    
    assert AGENT_NAME == "TeamSkillsAssistant"


@pytest.mark.asyncio
async def test_agent_stream_error_when_not_initialized():
    """Test agent stream yields error when not initialized."""
    from agent import SkillsAgent
    
    agent = SkillsAgent()
    
    events = []
    async for event in agent.run_stream("test"):
        events.append(event)
    
    assert len(events) == 1
    assert events[0]["type"] == "error"
    assert "not available" in events[0]["content"].lower()


@pytest.mark.asyncio
async def test_agent_cleanup_handles_uninitialized():
    """Test cleanup works even when agent wasn't initialized."""
    from agent import SkillsAgent
    
    agent = SkillsAgent()
    # Should not raise
    await agent.cleanup()
    assert not agent.is_available
