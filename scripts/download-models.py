import os
import requests
from pathlib import Path

MODEL_NAME = "sentence-transformers/all-MiniLM-L6-v2"
FILES = [
    "model.onnx",
    "tokenizer.json",
    "config.json",
    "vocab.txt",
    "tokenizer_config.json",
    "special_tokens_map.json"
]

def download_file(url, dest):
    print(f"Downloading {url} to {dest}...")
    response = requests.get(url, stream=True)
    response.raise_for_status()
    
    with open(dest, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            if chunk:
                f.write(chunk)

def main():
    base_dir = Path("models/all-MiniLM-L6-v2")
    base_dir.mkdir(parents=True, exist_ok=True)
    
    base_url = f"https://huggingface.co/{MODEL_NAME}/resolve/main"
    
    for filename in FILES:
        if filename == "model.onnx":
            url = f"{base_url}/onnx/{filename}"
        else:
            url = f"{base_url}/{filename}"
        dest = base_dir / filename
        
        if dest.exists():
            print(f"{filename} already exists, skipping.")
            continue
            
        try:
            download_file(url, dest)
        except Exception as e:
            print(f"Failed to download {filename}: {e}")

if __name__ == "__main__":
    main()
