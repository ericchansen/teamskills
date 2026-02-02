"""Tests for the agent service."""
import pytest
from unittest.mock import patch, AsyncMock
from httpx import AsyncClient, ASGITransport

from main import app


@pytest.fixture
def anyio_backend():
    return "asyncio"


@pytest.fixture
def mock_agent():
    """Mock the skills agent."""
    with patch("main.skills_agent") as mock:
        mock.is_available = False
        mock.run = AsyncMock(return_value="Test response")
        mock.run_stream = AsyncMock()
        yield mock


@pytest.mark.asyncio
async def test_health_check():
    """Test that health endpoint returns healthy status."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/health")
    
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "healthy"
    assert data["service"] == "agent"
    assert "timestamp" in data


@pytest.mark.asyncio
async def test_root_endpoint():
    """Test that root endpoint returns service info."""
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/")
    
    assert response.status_code == 200
    data = response.json()
    assert data["service"] == "Team Skills Agent"
    assert data["version"] == "0.1.0"
    assert data["docs"] == "/docs"
    assert "agent_available" in data


@pytest.mark.asyncio
async def test_chat_returns_503_when_agent_unavailable(mock_agent):
    """Test chat endpoint returns 503 when agent is not available."""
    mock_agent.is_available = False
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/chat", json={"message": "Hello"})
    
    assert response.status_code == 503
    assert "not available" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_chat_returns_400_for_empty_message(mock_agent):
    """Test chat endpoint returns 400 for empty message."""
    mock_agent.is_available = True
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/chat", json={"message": "   "})
    
    assert response.status_code == 400
    assert "empty" in response.json()["detail"].lower()


@pytest.mark.asyncio
async def test_chat_success(mock_agent):
    """Test successful chat request."""
    mock_agent.is_available = True
    mock_agent.run.return_value = "Here are the experts..."
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/chat", json={"message": "Who knows Python?"})
    
    assert response.status_code == 200
    data = response.json()
    assert data["response"] == "Here are the experts..."


@pytest.mark.asyncio
async def test_chat_stream_returns_503_when_unavailable(mock_agent):
    """Test streaming endpoint returns 503 when agent unavailable."""
    mock_agent.is_available = False
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.post("/chat/stream", json={"message": "Hello"})
    
    assert response.status_code == 503


@pytest.mark.asyncio
async def test_agent_status_endpoint(mock_agent):
    """Test agent status endpoint."""
    mock_agent.is_available = False
    
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as client:
        response = await client.get("/agent/status")
    
    assert response.status_code == 200
    data = response.json()
    assert "available" in data
    assert "tools" in data
