import cv2
import numpy as np

def prepare(image: np.ndarray) -> np.ndarray:
    height, width = image.shape[:2]
    scale = min(1, 2400 / max(height, width))
    image = cv2.resize(image, (max(3, round(width * scale)), max(3, round(height * scale))))
    gray  = cv2.cvtColor(image, cv2.COLOR_RGB2GRAY)
    edges = cv2.Canny(cv2.GaussianBlur(gray, (5, 5), 0), 50, 150)
    contours, _ = cv2.findContours(edges, cv2.RETR_LIST, cv2.CHAIN_APPROX_SIMPLE)

    for contour in sorted(contours, key=cv2.contourArea, reverse=True)[:20]:
        area = cv2.contourArea(contour)
        if area < gray.size * 0.35: break
        points = cv2.approxPolyDP(contour, 0.02 * cv2.arcLength(contour, True), True)
        if len(points) != 4 or not cv2.isContourConvex(points): continue
        points = points.reshape(4, 2).astype(np.float32)
        center = points.mean(axis=0)
        angles = np.arctan2(points[:, 1] - center[1], points[:, 0] - center[0])
        points = points[np.argsort(angles)]
        points = np.roll(points, -np.argmin(points.sum(axis=1)), axis=0)
        tl, tr, br, bl = points
        width  = round(max(np.linalg.norm(tr - tl), np.linalg.norm(br - bl)))
        height = round(max(np.linalg.norm(bl - tl), np.linalg.norm(br - tr)))
        if min(width, height) < 100: continue
        target = np.array([[0, 0], [width - 1, 0], [width - 1, height - 1], [0, height - 1]], dtype=np.float32)
        matrix = cv2.getPerspectiveTransform(points, target)
        gray   = cv2.warpPerspective(gray, matrix, (width, height), borderMode=cv2.BORDER_REPLICATE)
        break

    return gray
