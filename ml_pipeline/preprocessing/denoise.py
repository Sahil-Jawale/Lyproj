"""
Denoise Module — Multi-stage denoising pipeline for prescription images.
Handles noise from camera capture, low lighting, and paper texture.
"""

import cv2
import numpy as np
from typing import Optional


def denoise_image(
    image: np.ndarray,
    method: str = 'combined',
    gaussian_kernel: int = 3,
    median_kernel: int = 3,
    bilateral_d: int = 9,
    bilateral_sigma_color: float = 75.0,
    bilateral_sigma_space: float = 75.0,
    nlm_h: float = 10.0,
) -> np.ndarray:
    """
    Apply denoising to a prescription image.
    
    Args:
        image: Input image (BGR)
        method: One of 'gaussian', 'median', 'bilateral', 'nlm', 'combined'
        gaussian_kernel: Kernel size for Gaussian blur (must be odd)
        median_kernel: Kernel size for median blur (must be odd)
        bilateral_d: Diameter of each pixel neighborhood for bilateral filter
        bilateral_sigma_color: Filter sigma in the color space
        bilateral_sigma_space: Filter sigma in the coordinate space
        nlm_h: Filter strength for Non-Local Means
    
    Returns:
        Denoised image
    """
    if method == 'gaussian':
        return cv2.GaussianBlur(image, (gaussian_kernel, gaussian_kernel), 0)
    
    elif method == 'median':
        return cv2.medianBlur(image, median_kernel)
    
    elif method == 'bilateral':
        return cv2.bilateralFilter(
            image, bilateral_d, bilateral_sigma_color, bilateral_sigma_space
        )
    
    elif method == 'nlm':
        # Non-Local Means Denoising — best quality but slowest
        if len(image.shape) == 3:
            return cv2.fastNlMeansDenoisingColored(image, None, nlm_h, nlm_h, 7, 21)
        else:
            return cv2.fastNlMeansDenoising(image, None, nlm_h, 7, 21)
    
    elif method == 'combined':
        # Multi-stage: Median (salt-and-pepper) → Bilateral (preserve edges)
        denoised = cv2.medianBlur(image, median_kernel)
        denoised = cv2.bilateralFilter(
            denoised, bilateral_d, bilateral_sigma_color, bilateral_sigma_space
        )
        return denoised
    
    else:
        raise ValueError(f"Unknown denoising method: {method}")


def remove_background_noise(image: np.ndarray, block_size: int = 51) -> np.ndarray:
    """
    Remove background noise and uneven lighting using morphological operations.
    Useful for prescriptions photographed on colored surfaces.
    
    Args:
        image: Input image (BGR or grayscale)
        block_size: Size of the morphological structuring element
    
    Returns:
        Image with background noise removed
    """
    if len(image.shape) == 3:
        gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
    else:
        gray = image.copy()
    
    # Estimate background using morphological closing
    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (block_size, block_size))
    background = cv2.morphologyEx(gray, cv2.MORPH_CLOSE, kernel)
    
    # Subtract background
    cleaned = cv2.subtract(background, gray)
    
    # Normalize
    cleaned = cv2.normalize(cleaned, None, 0, 255, cv2.NORM_MINMAX)
    
    return cleaned
