"""AI Agent implementation using Microsoft Agent Framework."""
import logging
from typing import Optional, AsyncIterator, Any

from azure.identity import DefaultAzureCredential
from agent_framework import ChatAgent
from agent_framework.azure import AzureOpenAIChatClient

from config import config
from tools import (
    find_experts_by_skills,
    get_team_skill_gaps,
    get_skill_summary,
    list_all_skills,
)

logger = logging.getLogger(__name__)

AGENT_INSTRUCTIONS = """You are a helpful Team Skills Assistant for the Team Skills Tracker application.

Your purpose is to help users find the right team members for projects, identify skill gaps, and understand the team's capabilities.

## What you can do:
1. **Find experts** - Help users find team members with specific skills
2. **Identify skill gaps** - Analyze which skills the team lacks or needs to improve
3. **Provide summaries** - Give overviews of team capabilities
4. **List available skills** - Show what skills are tracked in the system

## How to respond:
- Be concise and helpful
- When listing people, highlight their proficiency levels (L100=Beginner, L200=Intermediate, L300=Practitioner, L400=Expert)
- For skill gap questions, prioritize actionable insights
- If asked about skills you don't have data for, say so clearly

## Important:
- Always use the available tools to get accurate, current data
- Don't make up information about team members or skills
- If the database returns no results, communicate that clearly
"""

AGENT_NAME = "TeamSkillsAssistant"


class SkillsAgent:
    """AI agent for team skills queries."""
    
    def __init__(self):
        self._agent: Optional[ChatAgent] = None
        self._chat_client: Optional[AzureOpenAIChatClient] = None
        self._credential = None
    
    async def initialize(self) -> bool:
        """Initialize the agent with Azure OpenAI.
        
        Returns:
            True if initialization succeeded, False otherwise
        """
        if not config.azure_openai_endpoint:
            logger.warning("Azure OpenAI endpoint not configured, agent will be unavailable")
            return False
        
        try:
            # Use DefaultAzureCredential for flexibility (supports managed identity, CLI, etc.)
            self._credential = DefaultAzureCredential()
            
            # Create Azure OpenAI chat client with explicit configuration
            self._chat_client = AzureOpenAIChatClient(
                credential=self._credential,
                endpoint=config.azure_openai_endpoint,
                deployment_name=config.azure_openai_deployment,
            )
            
            # Create agent with tools
            self._agent = ChatAgent(
                chat_client=self._chat_client,
                instructions=AGENT_INSTRUCTIONS,
                tools=[
                    find_experts_by_skills,
                    get_team_skill_gaps,
                    get_skill_summary,
                    list_all_skills,
                ],
            )
            
            logger.info(f"Agent '{AGENT_NAME}' initialized successfully")
            return True
            
        except Exception as e:
            logger.error(f"Failed to initialize agent: {e}")
            return False
    
    async def run(self, message: str) -> str:
        """Run the agent with a user message.
        
        Args:
            message: The user's message/question
            
        Returns:
            The agent's response
        """
        if not self._agent:
            return "Agent is not available. Please check the service configuration."
        
        try:
            result = await self._agent.run(message)
            return result.text if hasattr(result, 'text') else str(result)
        except Exception as e:
            logger.error(f"Agent run failed: {e}")
            return "I encountered an error processing your request. Please try again."
    
    async def run_stream(self, message: str):
        """Run the agent with streaming response.
        
        Args:
            message: The user's message/question
            
        Yields:
            Chunks of the agent's response
        """
        if not self._agent:
            yield {"type": "error", "content": "Agent is not available"}
            return
        
        try:
            # Stream the response
            async for chunk in self._agent.run_stream(message):
                # Emit different event types based on chunk type
                if hasattr(chunk, 'tool_call'):
                    yield {
                        "type": "tool_call",
                        "name": chunk.tool_call.name,
                        "args": chunk.tool_call.arguments,
                    }
                elif hasattr(chunk, 'tool_result'):
                    yield {
                        "type": "tool_result",
                        "name": chunk.tool_result.name,
                        "result": str(chunk.tool_result.result)[:500],  # Truncate long results
                    }
                elif hasattr(chunk, 'text') and chunk.text:
                    yield {
                        "type": "content",
                        "content": chunk.text,
                    }
                elif hasattr(chunk, 'thinking') and chunk.thinking:
                    yield {
                        "type": "thinking",
                        "content": chunk.thinking,
                    }
            
            yield {"type": "done"}
            
        except Exception as e:
            logger.error(f"Agent stream failed: {e}")
            yield {"type": "error", "content": str(e)}
    
    async def cleanup(self) -> None:
        """Clean up agent resources."""
        if self._chat_client:
            self._chat_client = None
        self._credential = None
        self._agent = None
        logger.info("Agent cleaned up")
    
    @property
    def is_available(self) -> bool:
        """Check if the agent is initialized and available."""
        return self._agent is not None


# Global agent instance
skills_agent = SkillsAgent()
