# AGENTS.md

This file provides guidelines for coding agents working in this repository.

This project is part of the 24-hour Zernio Hackathon, which is a competition where participants create innovative software solutions using Zernio's platform and tools.

# Project Documentation

You can find more information about the project here:

- @README.md for general project information.
- @docs/prd.md for the detailed product requirements of the project.
- @docs/software_architecture_description.md for the software architecture description, including a flowchart illustrating the system's components and interactions.

# User Preferences

- The project should be organized in a domain-specific approach.
- Use `pnpm` as the package manager for this project. NEVER use `npm` or `yarn` to install dependencies.
- Python code must always use type hints for function parameters and return types.Use `mypy` to check for type errors.
- Dependencies should be installed in a virtual environment. Use `uv` to create a virtual environment and install dependencies in it. Never install dependencies globally.
- FastAPI endpoints should always validate requests and responses, using pydantic. They should also be documented using OpenAPI specifications.
