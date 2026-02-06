"""Agent service for Team Skills chat assistant.

This service provides an AI-powered chat interface for querying team skills.
"""
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address
from sse_starlette.sse import EventSourceResponse

from config import config
from db import db
from agent import skills_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Rate limiter
limiter = Limiter(key_func=get_remote_address)


class ChatRequest(BaseModel):
    """Request model for chat endpoint."""
    message: str
    conversation_id: Optional[str] = None


class ChatResponse(BaseModel):
    """Response model for non-streaming chat."""
    response: str
    conversation_id: Optional[str] = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle."""
    logger.info("Starting agent service...")
    logger.info(f"Azure OpenAI Endpoint: {config.azure_openai_endpoint or 'Not configured'}")
    
    # Connect to database
    if config.database_url:
        try:
            await db.connect()
            logger.info("Database connected")
        except Exception as e:
            logger.warning(f"Database connection failed: {e}")
    
    # Initialize AI agent
    try:
        await skills_agent.initialize()
        logger.info(f"Agent available: {skills_agent.is_available}")
    except Exception as e:
        logger.warning(f"Agent initialization failed: {e}")
    
    yield
    
    # Cleanup
    await skills_agent.cleanup()
    await db.disconnect()
    logger.info("Shutting down agent service...")


app = FastAPI(
    title="Team Skills Agent",
    description="AI-powered chat assistant for finding team members by skills",
    version="0.1.0",
    lifespan=lifespan,
)

# Rate limiting
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS configuration
FRONTEND_URL = config.frontend_url if hasattr(config, 'frontend_url') else None
if not FRONTEND_URL or FRONTEND_URL == "*":
    logger.warning("FRONTEND_URL not set or is wildcard. Using restrictive CORS.")
    allowed_origins = []  # Reject cross-origin in production if not configured
else:
    allowed_origins = [FRONTEND_URL]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)


@app.get("/health")
async def health_check():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "service": "agent",
    }


@app.get("/")
async def root():
    """Root endpoint."""
    return {
        "service": "Team Skills Agent",
        "version": "0.1.0",
        "docs": "/docs",
        "agent_available": skills_agent.is_available,
    }


@app.post("/chat", response_model=ChatResponse)
@limiter.limit(config.rate_limit)
async def chat(request: ChatRequest, req: Request):
    """Non-streaming chat endpoint.
    
    Send a message and receive a complete response.
    """
    if not skills_agent.is_available:
        raise HTTPException(
            status_code=503,
            detail="Agent service is not available. Check Azure OpenAI configuration."
        )
    
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    response = await skills_agent.run(request.message)
    
    return ChatResponse(
        response=response,
        conversation_id=request.conversation_id,
    )


@app.post("/chat/stream")
@limiter.limit(config.rate_limit)
async def chat_stream(request: ChatRequest, req: Request):
    """Streaming chat endpoint using Server-Sent Events.
    
    Send a message and receive streaming response with:
    - thinking: Agent's reasoning process
    - tool_call: When agent uses a tool
    - tool_result: Result from tool execution
    - content: Response text chunks
    - done: Stream complete
    - error: If something went wrong
    """
    if not skills_agent.is_available:
        raise HTTPException(
            status_code=503,
            detail="Agent service is not available. Check Azure OpenAI configuration."
        )
    
    if not request.message.strip():
        raise HTTPException(status_code=400, detail="Message cannot be empty")
    
    async def event_generator():
        """Generate SSE events from agent stream."""
        try:
            async for event in skills_agent.run_stream(request.message):
                yield {
                    "event": event.get("type", "message"),
                    "data": json.dumps(event),
                }
        except Exception as e:
            logger.error(f"Stream error: {e}")
            yield {
                "event": "error",
                "data": json.dumps({"type": "error", "content": str(e)}),
            }
    
    return EventSourceResponse(event_generator())


@app.get("/agent/status")
async def agent_status():
    """Check agent status and capabilities."""
    return {
        "available": skills_agent.is_available,
        "model": config.azure_openai_deployment if skills_agent.is_available else None,
        "tools": [
            "find_experts_by_skills",
            "get_team_skill_gaps", 
            "get_skill_summary",
            "list_all_skills",
        ] if skills_agent.is_available else [],
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host=config.host, port=config.port)
