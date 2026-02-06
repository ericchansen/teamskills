"""Configuration for the agent service."""
import os
from dataclasses import dataclass


@dataclass
class Config:
    """Agent service configuration."""
    
    # Azure OpenAI settings
    azure_openai_endpoint: str
    azure_openai_deployment: str
    
    # Database settings
    database_url: str
    
    # Server settings
    host: str = "0.0.0.0"
    port: int = 8000
    
    # CORS settings
    frontend_url: str = ""
    
    # Rate limiting
    rate_limit: str = "10/minute"
    
    # Environment
    environment: str = "development"
    
    @property
    def is_production(self) -> bool:
        """Check if running in production."""
        return self.environment.lower() in ("production", "prod")
    
    @classmethod
    def from_env(cls) -> "Config":
        """Load configuration from environment variables."""
        return cls(
            azure_openai_endpoint=os.environ.get("AZURE_OPENAI_ENDPOINT", ""),
            azure_openai_deployment=os.environ.get("AZURE_OPENAI_DEPLOYMENT_NAME", "gpt-4o"),
            database_url=os.environ.get("DATABASE_URL", ""),
            host=os.environ.get("HOST", "0.0.0.0"),
            port=int(os.environ.get("PORT", "8000")),
            frontend_url=os.environ.get("FRONTEND_URL", ""),
            rate_limit=os.environ.get("RATE_LIMIT", "10/minute"),
            environment=os.environ.get("ENVIRONMENT", "development"),
        )


config = Config.from_env()
