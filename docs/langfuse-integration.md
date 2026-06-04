# Langfuse LLM Observability Guide

This guide explains how to use Langfuse to trace and monitor LLM calls in the Overturn worker.

## Setup

Langfuse is automatically initialized on worker startup if these environment variables are set:
- `LANGFUSE_PUBLIC_KEY`
- `LANGFUSE_SECRET_KEY`
- `LANGFUSE_HOST` (optional, defaults to https://cloud.langfuse.com)

## Usage

### Method 1: Context Manager

```python
from overturn_worker.langfuse import tracer

async def draft_appeal(denial: Denial) -> str:
    with tracer.trace_llm_call(
        model="claude-opus-4-7",
        practice_id=denial.claim.practiceId,
        denial_id=denial.id,
        operation="draft_appeal",
        metadata={"denial_code": denial.denialCode}
    ) as span:
        # Set the input
        span.set_input(
            prompt=f"Draft an appeal for: {denial.denialReason}",
            system_prompt="You are an expert appeal writer..."
        )

        # Make the LLM call
        response = await anthropic_client.messages.create(...)

        # Record the output
        span.set_output(
            completion=response.content[0].text,
            usage={
                "prompt_tokens": response.usage.input_tokens,
                "completion_tokens": response.usage.output_tokens,
                "total_tokens": response.usage.input_tokens + response.usage.output_tokens
            }
        )

        return response.content[0].text
```

### Method 2: Decorator

```python
from overturn_worker.langfuse import trace_llm

@trace_llm(model="claude-opus-4-7", operation="draft_appeal")
async def draft_appeal(denial: Denial) -> str:
    response = await anthropic_client.messages.create(...)
    return response.content[0].text
```

### Method 3: Manual Span Creation

```python
from overturn_worker.langfuse import tracer

async def draft_appeal(denial: Denial) -> str:
    span = tracer.create_span(
        model="claude-opus-4-7",
        practice_id=denial.claim.practiceId,
        denial_id=denial.id,
        operation="draft_appeal"
    )

    try:
        span.set_input(prompt=denial.denialReason)
        response = await anthropic_client.messages.create(...)
        span.set_output(completion=response.content[0].text)
        return response.content[0].text
    finally:
        span.end()
```

## PHI Scrubbing

Langfuse automatically scrubs PHI before sending traces:

- **Keys matching**: `patient`, `member`, `claim`, `denial`, `dob`, `ssn`, `address`, `phone`, `email`
- **Patterns**: SSN format (123-45-6789), member IDs (MEMXXXXX), claim IDs (CLMXXXXX)
- **Values containing**: Patient names, member IDs, dates of birth, etc.

**Example:**
```python
# Before scrubbing
{
    "patient_name": "John Doe",
    "member_id": "MEM123456",
    "denial_reason": "Not medically necessary"
}

# After scrubbing (sent to Langfuse)
{
    "patient_name": "[PHI_REDACTED]",
    "member_id": "[PHI_REDACTED]",
    "denial_reason": "Not medically necessary"  # kept
}
```

## Metrics Captured

Each LLM call automatically captures:

- **Latency**: Time from start to completion (ms)
- **Token usage**: Prompt, completion, and total tokens
- **Cost**: Calculated based on model pricing
- **Success/failure**: Whether the call succeeded
- **Error messages**: Captured if the call fails

## View Traces

Access your Langfuse dashboard to view traces:

1. Go to your Langfuse instance (https://cloud.langfuse.com or your hosted instance)
2. Navigate to "Traces" to see all LLM calls
3. Filter by:
   - Practice ID
   - Operation type (draft_appeal, classify_denial, etc.)
   - Model
   - Time range
4. View individual traces to see:
   - Prompts and responses
   - Token usage and costs
   - Latency metrics
   - Error details

## Best Practices

1. **Always include practice_id and denial_id**: This enables filtering and debugging
2. **Use descriptive operation names**: Like `draft_appeal`, `classify_denial`, `strategize`
3. **Set metadata for context**: Include denial codes, payer IDs, etc.
4. **Handle errors gracefully**: The span will capture any exceptions
5. **Flush on shutdown**: Call `tracer.flush()` when shutting down the worker

## Example: Complete Activity Integration

```python
from overturn_worker.langfuse import tracer, trace_llm
import anthropic

@trace_llm(model="claude-opus-4-7", operation="draft_appeal")
@activity.defn
async def llm_draft_appeal(denial_id: str, context: str, policies: list) -> str:
    """LLM activity for drafting appeals with automatic tracing."""

    denial = await load_denial(denial_id)

    # The decorator automatically traces this call
    client = anthropic.Anthropic()
    message = client.messages.create(
        model="claude-opus-4-7",
        max_tokens=4096,
        system="You are an expert at drafting medical claim appeals...",
        messages=[{
            "role": "user",
            "content": f"Context: {context}\n\nPolicies: {policies}\n\nDraft appeal for denial: {denial.denialReason}"
        }]
    )

    return message.content[0].text
```

## Troubleshooting

### Langfuse not showing traces

1. Check environment variables are set
2. Verify `LANGFUSE_PUBLIC_KEY` and `LANGFUSE_SECRET_KEY` are correct
3. Check worker logs for initialization messages
4. Ensure the activity is actually being called

### Missing token usage

- Make sure to call `span.set_output()` with the `usage` parameter
- Check that the LLM response includes usage information

### PHI appearing in traces

- Ensure you're using the tracer (not raw Langfuse SDK)
- Check that PHI patterns are recognized
- Report any patterns that should be scrubbed but aren't

## Cost Tracking

Langfuse automatically calculates costs based on:
- Model pricing (from Anthropic)
- Token usage (prompt + completion)
- Operation frequency

View costs in Langfuse dashboard under "Analytics" → "Costs".
