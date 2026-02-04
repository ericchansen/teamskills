"""Agent service for Team Skills chat assistant.

This service provides an AI-powered chat interface for querying team skills.
"""
import json
import logging
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

from config import config
from db import db
from agent import skills_agent

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


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

# CORS configuration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Configure appropriately for production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
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
async def chat(request: ChatRequest):
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
async def chat_stream(request: ChatRequest):
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
