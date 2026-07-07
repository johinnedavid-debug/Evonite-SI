# Contributing to Evonite-SI

## Development Setup

### Backend

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

## Code Style

### Python
- Follow PEP 8
- Use type hints
- Format with `black`: `black backend/`
- Lint with `flake8`: `flake8 backend/`

### TypeScript/React
- Use `prettier`: `npm run format`
- ESLint: `npm run lint`
- Component naming: PascalCase
- Hook naming: camelCase with `use` prefix

## Testing

### Backend

```bash
cd backend
pytest tests/ -v
pytest -k test_spawn -v  # Run specific tests
```

### Frontend

```bash
cd frontend
npm run test
npm run test:watch
```

## Commit Guidelines

Format: `<type>: <subject>`

- `feat:` New feature
- `fix:` Bug fix
- `docs:` Documentation
- `refactor:` Code refactoring
- `test:` Test additions
- `chore:` Build, deps, config

Examples:
```
feat: add approval gate for agent spawning
fix: correct goal prioritization in orchestrator
docs: update ARCHITECTURE.md
refactor: extract skill matching logic
test: add unit tests for hardware scanner
chore: upgrade fastapi to 0.115.0
```

## Pull Request Process

1. Create feature branch: `git checkout -b feat/my-feature`
2. Make changes and test thoroughly
3. Push: `git push origin feat/my-feature`
4. Open PR with description of What/Why/How/Testing
5. Address code review feedback
6. Merge and delete branch

## Adding a New Skill

### 1. Define in `backend/skills/base_skills.py`:

```python
class MySkill(BaseSkill):
    name = "my_skill"
    
    async def execute(self, input_data: dict, context: dict) -> dict:
        return {"output": result, "confidence": 0.95}
```

### 2. Register in `backend/skills/registry.py`:

```python
registry.register_skill(MySkill())
```

### 3. Test:

```python
import pytest
from backend.skills.base_skills import MySkill

class TestMySkill:
    @pytest.mark.asyncio
    async def test_execute(self):
        skill = MySkill()
        result = await skill.execute({"query": "test"}, {"agent_id": "test-agent"})
        assert "output" in result
```

## Adding a New Agent Archetype

### 1. Add to `KNOWN_ARCHETYPES` in `backend/api_server.py`:

```python
KNOWN_ARCHETYPES["my_type"] = {
    "description": "Specialized for X tasks",
    "skills": ["skill1", "skill2"],
}
```

### 2. Update fuzzy-matching in `_match_archetype()`:

```python
keyword_map = {
    # ...
    "my_type": ["keyword1", "keyword2"],
}
```

## Questions?

Open an issue or discussion on GitHub.
