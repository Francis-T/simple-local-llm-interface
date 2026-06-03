import asyncio
import json
import os
import pprint
import re
import time

from mlx_lm.sample_utils import make_sampler, make_logits_processors
from mlx_lm import stream_generate, generate, load
from pydantic import BaseModel

STREAM_CHUNK_SIZE = 8
BASE_AI_MODELS_DIR = os.getenv("AI_MODELS")

class LocalModel():
    def __init__(self, provider, name):
        self.provider = provider
        self.name = name
        self.model = None
        self.tokenizer = None
        self.config = None

class StreamChunk(BaseModel):
    id: int | None
    type: str
    data: str

def log(msg):
    print(msg)
    return

def select_dirs(dir_path):
    dirs = list(filter(lambda d: os.path.isdir(os.path.join(dir_path,d)),
                       os.listdir(dir_path)))
    return sorted(dirs)

def get_ai_providers(models_dir):
    def is_valid_ai_provider(d):
        return ("mlx" in d) and \
               (not d.startswith("."))
    return list(
        filter(is_valid_ai_provider,
               select_dirs(models_dir)
    ))

def get_provider_models(models_dir, provider):
    provider_dir = os.path.join(models_dir, 
                                provider)

    def is_valid_model(model):
        if model.startswith("."): return False
        cfg_path = os.path.join(provider_dir, 
                                model, 
                                "config.json")
        if not os.path.isfile(cfg_path):
            return False
        return True

    provider_models = list(
        filter(is_valid_model,
               select_dirs(provider_dir))
    )

    return provider_models

def get_model_list(models_dir=None):
    if models_dir is None:
        models_dir = BASE_AI_MODELS_DIR
        print(models_dir)

    # Get the available AI providers (i.e. this 
    #  is simply the folder under which they are 
    #  stored for now, just to keep things 
    #  organized between our custom quants and 
    #  those from huggingface
    provider_list = get_ai_providers(models_dir)

    # Extract the models for each provider
    models = []
    for provider in provider_list:
        prov_models = get_provider_models(models_dir, 
                                          provider)
        for model in prov_models:
            models.append({
                'provider' : provider,
                'name' : model
            })

    # Sort the models?
    def get_model_key(m):
        return m['provider'] + "/" + m['name']

    models.sort(key=get_model_key)

    return models

def load_model_config_file(model_config_filepath):
    log(f"Reloading {model_config_filepath}...")
    with open(model_config_filepath, "r") as cfg_fp:
        full_config = json.load(cfg_fp)
        pprint.pprint(full_config)

    return full_config

def load_model(target, models_dir=None):
    if models_dir is None:
        models_dir = BASE_AI_MODELS_DIR

    model_path = os.path.join(models_dir,
                              target['provider'],
                              target['name'])
    if not os.path.isdir(model_path):
        log("Selected model's path is invalid")
        return None

    # Initialize model data object
    loaded_model = LocalModel(**target)

    model_config_filepath = os.path.join("model_configs",
                                         target['name'] + "__config.json")
    if os.path.isfile(model_config_filepath):
        loaded_model.config = load_model_config_file(model_config_filepath)

    
    # Attempt to load the model
    model, tokenizer = load(path_or_hf_repo=model_path,
                            tokenizer_config=loaded_model.config['tokenizer'])

    if (model is None) or (tokenizer is None):
        log("Failed to load the model")
        return None

    loaded_model.model = model
    loaded_model.tokenizer = tokenizer

    return loaded_model

def build_sampler(model_config, request_config):
    valid_sampler_params = [
        "temp", "top_p", "min_p", "min_tokens_to_keep", "top_k",
        "xtc_probability", "xtc_threshold", "xtc_special_tokens",
    ]
    aliased_params = {
        "temp" : "temperature"
    }

    sampler_params = {}
    for param in valid_sampler_params:
        param_value = None
        if param in model_config.keys():
            param_value = model_config[param]
        elif (param in aliased_params.keys()):
            param_alias = aliased_params[param]
            if param_alias in model_config.keys():
                param_value = model_config[param_alias]

        if param in request_config.keys():
            param_value = request_config[param]
        elif (param in aliased_params.keys()):
            param_alias = aliased_params[param]
            if param_alias in request_config.keys():
                param_value = request_config[param_alias]

        if not param_value is None:
            sampler_params[param] = param_value

    return make_sampler(**sampler_params)

def build_logit_processors(model_config, request_config):
    valid_logit_proc_params = [
        "repetition_penalty", "repetition_context_size",
        "presence_penalty", "presence_context_size",
        "frequency_penalty", "frequency_context_size",
    ]

    aliased_params = {
        "repetition_context_size" : "repetition_penalty_range",
        "presence_context_size" : "presence_penalty_range",
        "frequency_context_size" : "frequency_penalty_range"
    }

    logit_proc_params= {}
    for param in valid_logit_proc_params:
        param_value = None
        if param in model_config.keys():
            param_value = model_config[param]
        elif (param in aliased_params.keys()):
            param_alias = aliased_params[param]
            if param_alias in model_config.keys():
                param_value = model_config[param_alias]

        if param in request_config.keys():
            param_value = request_config[param]
        elif (param in aliased_params.keys()):
            param_alias = aliased_params[param]
            if param_alias in request_config.keys():
                param_value = request_config[param_alias]

        if not param_value is None:
            logit_proc_params[param] = param_value

    return make_logits_processors(**logit_proc_params)

def flatten_messages(request_messages):
    messages = []
    for rm in request_messages:
        messages.append({
            'role' : rm.role,
            'content' : rm.content
        })

    return messages

def format_response(response, resp_id, resp_type, model, created, metrics):
    final = {
        "id": resp_id,
        "system": "local",
        "object": resp_type,
        "model" : model,
        "created" : created,
        "choices" : [],
        "usage" : {
            "prompt_tokens" : metrics['tokens']['prompt'],
            "completion_tokens" : metrics['tokens']['generation'],
            "total_tokens" : metrics['tokens']['prompt'] + metrics['tokens']['generation'],
            "prompt_tokens_details" : {
                "cached_tokens" : 0
            }
        }
    }
    
    reasoning = None
    content = response
    if ("<|channel>" in response) and ("<channel|>" in response):
        reasoning = re.findall(r"<\|channel>(.+)<channel\|>", 
                               response, 
                               flags=re.DOTALL)[0]
        content = re.sub(r"<\|channel>.+<channel\|>", "",
                         response, flags=re.DOTALL)

    choice = {
        "index" : 0,
        "finish_reason": "stop",
        "message" : {
            "role" : "assistant",
            "content" : content,
        }
    }

    if not reasoning is None:
        choice['message']['reasoning'] = reasoning

    final['choices'].append(choice)

    def truncf(f):
        return float(f"{f:.2f}")

    final['extras'] = {
        "prompt_tps" : truncf(metrics['tps']['prompt']),
        "completion_tps" : truncf(metrics['tps']['generation']),
        "time" : {
            "response_preparation" : truncf(metrics['time']['response_preparation']['total']),
            "time_to_first_response" : truncf(metrics['time']['first_chunk']['total']),
            "response_generation" : truncf(metrics['time']['response_generation']['total']),
            "overall" : truncf(metrics['time']['overall']['total']),
        },
        "memory_usage": {
            "peak" : truncf(metrics['memory']['peak']),
        }
    }



    return final

async def model_stream(app_data, loaded, request):
    metrics = {
        'time'   : {},
        'tokens' : {},
        'tps'    : {},
        'memory' : {}
    }

    total_start_time = time.time()
    start_time = time.time()
    messages = flatten_messages(request.messages)
    prompt = loaded.tokenizer.apply_chat_template(
        conversation=messages,
        #tools=tools,
        enable_thinking=request.enable_thinking,
        add_generation_prompt=True,
    )

    # Initialize the Sampler
    sampler = build_sampler(loaded.config['model'],
                            request.sampler.__dict__)

    # Initialize the Logits Processors
    logit_proc = build_logit_processors(loaded.config['model'],
                                        request.logit_processors.__dict__)

    # Create the response stream
    stream = stream_generate(
        model=loaded.model,
        tokenizer=loaded.tokenizer,
        prompt=prompt,
        max_tokens=request.max_tokens,
        sampler=sampler,
        logits_processors=logit_proc,
        # prompt_cache=prompt_cache,
    )
    end_time = time.time()
    metrics['time']['response_preparation'] = {
        'start' : start_time,
        'end'   : end_time,
        'total' : end_time-start_time
    }

    # Generate the response
    start_time = time.time()

    response = ""
    is_first_chunk = True
    chunk_sizes = []
    chunk_data = ""
    try:
        chunk_id = 0
        for chunk in stream:
            if app_data.get_state() != "STARTED":
                break

            new_chunk = str(chunk.text)
            if "|>" in new_chunk:
                new_chunk = new_chunk.replace("|>", "|>\n\n")

            print(new_chunk, end="", flush=True)
            chunk_sizes.append(len(new_chunk))

            if len(chunk_data + chunk.text) < STREAM_CHUNK_SIZE:
                chunk_data += chunk.text
            else:
                chunk_data += str(chunk.text)
                # yield json.dumps({
                #     'id': chunk_id,
                #     'type': 'chunk',
                #     'data': chunk_data,
                # }) + "\n"
                yield StreamChunk(id=chunk_id, 
                                  type='chunk', 
                                  data=chunk_data)

                chunk_data = ""
                chunk_id += 1

            response += chunk.text

            if is_first_chunk:
                first_chunk_time = time.time()
                metrics['time']['first_chunk'] = {
                    'start': first_chunk_time, 
                    'end': first_chunk_time,
                    'total': first_chunk_time-start_time
                }
                is_first_chunk = False

    except KeyboardInterrupt:
        print("[SYSTEM]> Response Interrupted")
        pass
    
    end_time = time.time()
    metrics['time']['response_generation'] = {
        'start' : start_time,
        'end'   : end_time,
        'total' : end_time-start_time
    }

    metrics['tokens']['prompt'] = chunk.prompt_tokens
    metrics['tokens']['generation'] = chunk.generation_tokens
    metrics['tps']['prompt'] = chunk.prompt_tps
    metrics['tps']['generation'] = chunk.generation_tps

    # metrics['memory']['start'] = start_mem_usage / B_PER_GB
    metrics['memory']['peak'] = chunk.peak_memory
    # metrics['memory']['end'] = end_mem_usage / B_PER_GB

    total_end_time = time.time()
    metrics['time']['overall'] = {
        'start' : total_start_time,
        'end'   : total_end_time,
        'total' : total_end_time-total_start_time,
    }

    final_response = format_response(response,
                                     resp_id=len(messages),
                                     resp_type="chat.completion",
                                     model=f"{loaded.provider}/{loaded.name}",
                                     created=int(total_start_time),
                                     metrics=metrics)
    # yield json.dumps({
    #     'id': 0,
    #     'type': 'final',
    #     'data': final_response,
    # }) + "\n"
    yield StreamChunk(id=0,
                      type='final',
                      data=json.dumps(final_response))
    return

async def model_request(app_data, loaded, request):
    final_response = None
    async for res in model_stream(app_data, loaded, request):
        if res.type != 'final': continue
        final_response = res.data
        break

    yield final_response

