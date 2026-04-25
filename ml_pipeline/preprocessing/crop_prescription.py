"""
Crop Prescription Module — Document boundary detection and cropping.
Detects the prescription paper boundary and crops out background.
"""

import cv2
import numpy as np
from typing import Tuple, Optional


def crop_prescription(
    image: np.ndarray,
    margin: int = 10,
    min_area_ratio: float = 0.1,
) -> np.ndarray:
    """
    Detect and crop the prescription document from the image.
    Uses contour detection to find the largest rectangular region.
    
    Args:
        image: Input image (BGR)
        margin: Extra pixels to include around detected boundary
        min_area_ratio: Minimum contour area as ratio of image area
    
    Returns:
        Cropped prescription image
    """
    h, w = image.shape[:2]
    image_area = h * w
    
    # Preprocessing for contour detection
    gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    blurred = cv2.GaussianBlur(gray, (5, 5), 0)
    edges = cv2.Canny(blurred, 50, 150)
    
    # Dilate to close gaps in edges
    kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (5, 5))
    edges = cv2.dilate(edges, kernel, iterations=2)
    
    # Find contours
    contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    
    if not contours:
        return image
    
    # Find the largest contour by area
    largest_contour = max(contours, key=cv2.contourArea)
    contour_area = cv2.contourArea(largest_contour)
    
    # Check if contour is large enough to be the document
    if contour_area < image_area * min_area_ratio:
        return image
    
    # Try to approximate as quadrilateral
    peri = cv2.arcLength(largest_contour, True)
    approx = cv2.approxPolyDP(largest_contour, 0.02 * peri, True)
    
    if len(approx) == 4:
        # Perspective transform for 4-point detection
        return _four_point_transform(image, approx.reshape(4, 2))
    else:
        # Fall back to bounding rectangle
        x, y, bw, bh = cv2.boundingRect(largest_contour)
        x = max(0, x - margin)
        y = max(0, y - margin)
        bw = min(w - x, bw + 2 * margin)
        bh = min(h - y, bh + 2 * margin)
        return image[y:y+bh, x:x+bw]


def _four_point_transform(image: np.ndarray, pts: np.ndarray) -> np.ndarray:
    """
    Apply perspective transform given 4 corner points.
    Orders points as: top-left, top-right, bottom-right, bottom-left.
    """
    rect = _order_points(pts)
    (tl, tr, br, bl) = rect
    
    # Compute output dimensions
    width_a = np.linalg.norm(br - bl)
    width_b = np.linalg.norm(tr - tl)
    max_width = max(int(width_a), int(width_b))
    
    height_a = np.linalg.norm(tr - br)
    height_b = np.linalg.norm(tl - bl)
    max_height = max(int(height_a), int(height_b))
    
    dst = np.array([
        [0, 0],
        [max_width - 1, 0],
        [max_width - 1, max_height - 1],
        [0, max_height - 1]
    ], dtype=np.float32)
    
    M = cv2.getPerspectiveTransform(rect.astype(np.float32), dst)
    warped = cv2.warpPerspective(image, M, (max_width, max_height))
    
    return warped


def _order_points(pts: np.ndarray) -> np.ndarray:
    """Order 4 points as: top-left, top-right, bottom-right, bottom-left."""
    rect = np.zeros((4, 2), dtype=np.float32)
    
    s = pts.sum(axis=1)
    rect[0] = pts[np.argmin(s)]   # top-left: smallest sum
    rect[2] = pts[np.argmax(s)]   # bottom-right: largest sum
    
    d = np.diff(pts, axis=1)
    rect[1] = pts[np.argmin(d)]   # top-right: smallest difference
    rect[3] = pts[np.argmax(d)]   # bottom-left: largest difference
    
    return rect
