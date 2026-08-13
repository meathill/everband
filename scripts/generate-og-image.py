from pathlib import Path
import sys

from PIL import Image, ImageDraw


# 生成 1200x630 的社交分享图（og:image）：
# 近白到淡绿的垂直渐变背景 + 居中偏上的品牌 lockup（深青 logo，透明背景）。
source_path = Path(sys.argv[1])
output_path = Path(sys.argv[2])

WIDTH, HEIGHT = 1200, 630
TOP_COLOR = (255, 255, 255)
BOTTOM_COLOR = (225, 238, 231)

canvas = Image.new("RGBA", (WIDTH, HEIGHT))
draw = ImageDraw.Draw(canvas)
for y in range(HEIGHT):
    t = y / (HEIGHT - 1)
    color = tuple(round(TOP_COLOR[i] + (BOTTOM_COLOR[i] - TOP_COLOR[i]) * t) for i in range(3))
    draw.line([(0, y), (WIDTH, y)], fill=(*color, 255))

with Image.open(source_path).convert("RGBA") as lockup:
    # 目标宽度 900，等比缩放；水平居中，垂直位置约 42%（给底部留呼吸）
    scale = 900 / lockup.width
    resized = lockup.resize(
        (round(lockup.width * scale), round(lockup.height * scale)),
        Image.Resampling.LANCZOS,
    )
    x = (WIDTH - resized.width) // 2
    y = round(HEIGHT * 0.42) - resized.height // 2
    canvas.alpha_composite(resized, (x, y))

canvas.convert("RGB").save(output_path, format="PNG", optimize=True)
print(f"written: {output_path}")
