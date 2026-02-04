FROM python:3.12-slim

WORKDIR /app

# Install dependencies (--pre for agent-framework preview packages)
COPY requirements.txt .
RUN pip install --no-cache-dir --pre -r requirements.txt

# Copy application code
COPY . .

# Expose port
EXPOSE 8000

# Run the application
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
