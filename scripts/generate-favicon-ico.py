from pathlib import Path
import sys

from PIL import Image


source_path = Path(sys.argv[1])
ico_path = Path(sys.argv[2])
png_path = Path(sys.argv[3])

with Image.open(source_path).convert("RGBA") as source:
    source.resize((256, 256), Image.Resampling.LANCZOS).convert("RGB").save(
        png_path,
        format="PNG",
        optimize=True,
    )
    icon = source.resize((32, 32), Image.Resampling.LANCZOS)
    icon.save(ico_path, format="ICO", sizes=[(32, 32)])
