import os
import torch
import open_clip
from PIL import Image
from tqdm import tqdm
import pandas as pd

# ================= CONFIG =================
DATASET_ROOT = "E:/IMAGES/0/0"             # Root folder containing 0,1,...,8
OUTPUT_CSV = "clip_embeddings.csv"      # Output CSV file
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

MODEL_PATH = "E:/models/open_clip_model.safetensors"  # Your downloaded model
MODEL_NAME = "ViT-B-32"  # Use a built-in OpenCLIP model name
BATCH_SIZE = 32           # Adjust for your GPU/CPU memory

# ================= LOAD MODEL =================
print("Loading OpenCLIP model...")
model, _, preprocess = open_clip.create_model_and_transforms(
    MODEL_NAME, pretrained=MODEL_PATH
)
model = model.to(DEVICE)
model.eval()

# ================= COLLECT IMAGE PATHS =================
image_paths = []
for folder_name in sorted(os.listdir(DATASET_ROOT)):
    folder_path = os.path.join(DATASET_ROOT, folder_name)
    if os.path.isdir(folder_path):
        for fname in os.listdir(folder_path):
            if fname.lower().endswith(".jpg"):
                image_paths.append({
                    "folder": folder_name,
                    "file": fname,
                    "path": os.path.join(folder_path, fname)
                })

print(f"Found {len(image_paths)} images.")

# ================= GENERATE EMBEDDINGS =================
embeddings_list = []

for i in tqdm(range(0, len(image_paths), BATCH_SIZE), desc="Processing Batches"):
    batch = image_paths[i:i+BATCH_SIZE]
    
    # Load and preprocess images
    imgs = []
    for img_info in batch:
        try:
            img = Image.open(img_info["path"]).convert("RGB")
            imgs.append(preprocess(img))
        except Exception as e:
            print(f"Skipping {img_info['path']} due to error: {e}")

    if not imgs:
        continue

    imgs_tensor = torch.stack(imgs).to(DEVICE)

    # Encode images
    with torch.no_grad():
        batch_embeddings = model.encode_image(imgs_tensor)
        batch_embeddings /= batch_embeddings.norm(dim=-1, keepdim=True)  # normalize

    batch_embeddings = batch_embeddings.cpu().numpy()

    # Save embeddings in dictionary format
    for j, emb in enumerate(batch_embeddings):
        emb_dict = {
            "folder": batch[j]["folder"],
            "file": batch[j]["file"],
        }
        emb_dict.update({f"dim_{k}": float(emb[k]) for k in range(emb.shape[0])})
        embeddings_list.append(emb_dict)

# ================= SAVE TO CSV =================
df = pd.DataFrame(embeddings_list)
df.to_csv(OUTPUT_CSV, index=False)
print(f"Saved embeddings to {OUTPUT_CSV}")
