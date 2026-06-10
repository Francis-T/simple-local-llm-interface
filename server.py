import gc
import os
import sqlite3

from collections.abc import AsyncIterable

import mlx.core as mx
import tinykv as tkv

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import core
from app_state import app_data

BASE_AI_MODELS_DIR = os.getenv("AI_MODELS")

def unload_model():
    app_data.loaded_model = None
    gc.collect()
    mx.clear_cache()
    return

# FastAPI models
class SelectedModel(BaseModel):
    provider : str
    name : str

class ModelMessage(BaseModel):
    role: str
    content: str

class SamplerParams(BaseModel):
    temperature : float | None = None
    top_p : float | None = None
    min_p : float | None = None

class LogitProcessorParams(BaseModel):
    repetition_penalty: float | None = None
    repetition_penalty_range: int | None = None
    frequency_penalty: float | None = None
    frequency_penalty_range: int | None = None
    presence_penalty: float | None = None
    presence_penalty_range: int | None = None

class ModelRequest(BaseModel):
    messages : list[ModelMessage] = []
    max_tokens : int | None = 100
    enable_thinking : bool | None = True
    sampler : SamplerParams
    logit_processors : LogitProcessorParams

class KeyValueObject(BaseModel):
    k : str
    v : str | None = ""

# Response types
def build_response(content_type, content):
    return {
        'type' : content_type,
        'content' : content,
    }

def info(msg):
    return build_response("info", msg)

def err(msg):
    return build_response("error", msg)

# FastAPI

app = FastAPI()

conn = sqlite3.connect("local.db")
try:
    tkv.create_schema(conn)
except sqlite3.OperationalError as e:
    print(f"Warning: SQLite - {e}")
    pass 
db = tkv.TinyKV(conn, allow_pickle=False)

allowed_origins = [
    "http://localhost:8000",
    "http://localhost:8080"
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/v1/models")
async def api_get_models():
    return core.get_model_list()

@app.get("/status")
async def api_get_status():
    if app_data.is_model_loaded():
        status = {
            'model_name': app_data.loaded_model.name,
            'model_provider': app_data.loaded_model.provider,
            'model_config' : app_data.loaded_model.config,
        }
        
        return status

    return info("No model loaded")

@app.post("/load")
async def api_select_model(selected : SelectedModel):
    if app_data.is_model_loaded():
        return err("Model already loaded")

    if (selected is None):
        return err("No model selected")

    if (selected.provider is None) or (selected.name is None):
        return err("Selected model is invalid")

    model_path = os.path.join(BASE_AI_MODELS_DIR,
                              selected.provider,
                              selected.name)
    if not os.path.isdir(model_path):
        return err("Selected model's path is invalid")

    app_data.loaded_model = core.load_model({
        'provider' : selected.provider,
        'name' : selected.name
    })
    if app_data.loaded_model is None:
        return err("Failed to load the model")

    return info("OK")

@app.post("/unload")
async def api_unload_selected_model():
    if not app_data.is_model_loaded():
        return err("No models loaded")

    # TODO This probably needs a lock
    unload_model()

    return info("OK")

@app.post("/set")
async def api_data_set(kv_obj : KeyValueObject):
    print("Storing Data:")
    print(kv_obj)
    db.set(kv_obj.k, kv_obj.v)
    conn.commit()
    return {
        'k': kv_obj.k,
        'v': db.get(kv_obj.k),
    }

@app.post("/get")
async def api_data_get(kv_obj : KeyValueObject):
    result = None
    try:
        result = db.get(kv_obj.k)
    except KeyError:
        result = None

    return {
        'k': kv_obj.k,
        'v': result,
    }

@app.post("/request")
async def api_model_request(request : ModelRequest):
    if (not app_data.is_model_loaded()) or (app_data.get_state() != "IDLE"):
        return err("No models loaded")
    print(request)
    
    app_data.start_model()
    async for result in core.model_request(app_data, app_data.loaded_model, request):
        pass
    app_data.idle_model()
    return result

@app.post("/stream")
async def api_model_stream(request: ModelRequest): # -> AsyncIterable[core.StreamChunk]:
    if (not app_data.is_model_loaded()) or (app_data.get_state() != "IDLE"):
        yield err("No models loaded")
    print(request)
    app_data.start_model()
    async for result in core.model_stream(app_data, app_data.loaded_model, request):
        yield result
    app_data.idle_model()

@app.post("/stop")
async def api_model_stop():
    if (not app_data.is_model_loaded()) or (app_data.get_state() == "STOPPED"):
        return err("No models loaded")

    app_data.stop_model()

app.mount("/", StaticFiles(directory="frontend",html=True), name="static")

