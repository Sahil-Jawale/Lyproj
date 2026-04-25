"""
Binarise Module — Adaptive thresholding for prescription images.
Converts grayscale to binary (black text on white background).
"""

import cv2
import numpy as np
from typing import Optional


def binarise_image(
    image: np.ndarray,
    method: str = 'otsu',
    block_size: int = 31,
    C: int = 10,
    invert: bool = False,
) -> np.ndarray:
    """
    Binarise a prescription image using adaptive thresholding.
    
    Args:
        image: Input image (BGR or grayscale)
        method: 'otsu', 'adaptive_gaussian', 'adaptive_mean', or 'sauvola'
        block_size: Block size for adaptive methods (must be odd)
        C: Constant subtracted from mean in adaptive methods
        invert: If True, invert output (white text on black)
    
    Returns:
        Binary image (uint8, values 0 or 255)
    """
    # Convert to grayscale if needed
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    
    if method == 'otsu':
        # Otsu's method — automatic threshold selection
        _, binary = cv2.threshold(
            gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU
        )
    
    elif method == 'adaptive_gaussian':
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY, block_size, C
        )
    
    elif method == 'adaptive_mean':
        binary = cv2.adaptiveThreshold(
            gray, 255, cv2.ADAPTIVE_THRESH_MEAN_C,
            cv2.THRESH_BINARY, block_size, C
        )
    
    elif method == 'sauvola':
        # Sauvola binarisation — better for uneven lighting
        binary = _sauvola_threshold(gray, window_size=block_size, k=0.2)
    
    else:
        raise ValueError(f"Unknown binarisation method: {method}")
    
    if invert:
        binary = cv2.bitwise_not(binary)
    
    return binary


def _sauvola_threshold(
    image: np.ndarray,
    window_size: int = 31,
    k: float = 0.2,
    R: float = 128.0
) -> np.ndarray:
    """
    Sauvola adaptive thresholding — handles uneven illumination better than Otsu.
    
    T(x,y) = mean(x,y) * (1 + k * (std(x,y)/R - 1))
    """
    image = image.astype(np.float64)
    
    # Compute local mean and standard deviation
    mean = cv2.blur(image, (window_size, window_size))
    mean_sq = cv2.blur(image ** 2, (window_size, window_size))
    std = np.sqrt(np.maximum(mean_sq - mean ** 2, 0))
    
    # Sauvola threshold
    threshold = mean * (1.0 + k * (std / R - 1.0))
    
    binary = np.zeros_like(image, dtype=np.uint8)
    binary[image >= threshold] = 255
    
    return binary
