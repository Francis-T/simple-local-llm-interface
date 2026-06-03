# Simple Local LLM Interface
This is a simple web interface for interacting with local LLMs *stored in a custom directory* through MLX.

## Caveats
This is a **handcoded** hobby exercise --- as such it most likely contains a lot of errors, bad practice, and probably misuse of Javascript and Python code! Absolutely NOT optimized nor production-ready!

## Pre-requisites
- FastAPI
- MLX-LM
- ??? --- there may be other stuff I forgot atm

## Usage
### 1. Setup your AI models directory.
The custom models directory must be declared under the env variable `AI_MODELS` (e.g. `export AI_MODELS=/your/ai/model/folder` in your `.bashrc`), and its underlying folder structure should be similar to the example below:
```
├── google
│   ├── gemma-4-e2b-it-q4
│   │   ├── chat_template.jinja
│   │   ├── config.json
│   │   ├── generation_config.json
│   │   ├── model.safetensors
│   │   ├── model.safetensors.index.json
│   │   ├── README.md
│   │   ├── tokenizer_config.json
│   │   └── tokenizer.json
│   ├── gemma-4-e4b-it-q4
│   │   ├── ...
```

### 2. Launch the FastAPI server
```
fastapi dev server.py --host <hostname> --port <port>
```

## But why tho?
I started this project for several reasons, namely:
- To learn about local LLMs and how to run them in a Python program (via the `mlx_lm` library)
- To re-learn how to develop basic web apps using a combination of classic Javascript, HTML, and CSS
- To make it easier to interact with multiple local LLMs produced by `mlx_lm.convert` in a separate folder on my local drive instead of having to point `mlx_lm.server` to the exact model folder each time

