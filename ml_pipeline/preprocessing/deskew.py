"""
Deskew Module — Hough Transform-based deskewing for prescription images.
Corrects rotational skew common in photographed/scanned prescriptions.
"""

import cv2
import numpy as np
from typing import Tuple, Optional


def compute_skew_angle(image: np.ndarray) -> float:
    """
    Compute the skew angle of a document image using Hough Line Transform.
    
    Args:
        image: Input image (BGR or grayscale)
    
    Returns:
        Estimated skew angle in degrees
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    
    # Edge detection
    edges = cv2.Canny(gray, 50, 150, apertureSize=3)
    
    # Hough Line Transform
    lines = cv2.HoughLinesP(
        edges, 1, np.pi / 180,
        threshold=100,
        minLineLength=100,
        maxLineGap=10
    )
    
    if lines is None:
        return 0.0
    
    # Calculate angles of detected lines
    angles = []
    for line in lines:
        x1, y1, x2, y2 = line[0]
        angle = np.degrees(np.arctan2(y2 - y1, x2 - x1))
        # Only consider near-horizontal lines (text lines)
        if abs(angle) < 45:
            angles.append(angle)
    
    if not angles:
        return 0.0
    
    # Use median angle to be robust against outliers
    return float(np.median(angles))


def deskew_image(
    image: np.ndarray,
    angle: Optional[float] = None,
    border_color: Tuple[int, int, int] = (255, 255, 255)
) -> np.ndarray:
    """
    Deskew a prescription image by rotating to correct detected skew.
    
    Args:
        image: Input image (BGR)
        angle: Override skew angle. If None, auto-detected.
        border_color: Color for border fill after rotation
    
    Returns:
        Deskewed image
    """
    if angle is None:
        angle = compute_skew_angle(image)
    
    # Skip if angle is negligible
    if abs(angle) < 0.5:
        return image
    
    h, w = image.shape[:2]
    center = (w // 2, h // 2)
    
    # Rotation matrix
    M = cv2.getRotationMatrix2D(center, angle, 1.0)
    
    # Compute new bounding dimensions
    cos_val = np.abs(M[0, 0])
    sin_val = np.abs(M[0, 1])
    new_w = int(h * sin_val + w * cos_val)
    new_h = int(h * cos_val + w * sin_val)
    
    # Adjust the rotation matrix for translation
    M[0, 2] += (new_w - w) / 2
    M[1, 2] += (new_h - h) / 2
    
    rotated = cv2.warpAffine(
        image, M, (new_w, new_h),
        flags=cv2.INTER_CUBIC,
        borderMode=cv2.BORDER_CONSTANT,
        borderValue=border_color
    )
    
    return rotated
