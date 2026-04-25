"""
Augmentation Module — Data augmentation pipeline for prescription images.
Uses Albumentations for training-time augmentation.
"""

import cv2
import numpy as np

try:
    import albumentations as A
    HAS_ALBUMENTATIONS = True
except ImportError:
    HAS_ALBUMENTATIONS = False


def get_training_augmentation():
    """
    Get the augmentation pipeline for training prescription OCR.
    Simulates real-world conditions: camera angle, lighting, noise, etc.
    """
    if not HAS_ALBUMENTATIONS:
        raise ImportError("albumentations is required. Install: pip install albumentations==1.3.1")
    
    return A.Compose([
        # Geometric transforms — simulate camera angle
        A.ShiftScaleRotate(
            shift_limit=0.05, scale_limit=0.1, rotate_limit=10,
            border_mode=cv2.BORDER_CONSTANT, value=(255, 255, 255), p=0.5
        ),
        A.Perspective(scale=(0.02, 0.05), p=0.3),
        
        # Blur — simulate focus issues
        A.OneOf([
            A.MotionBlur(blur_limit=3, p=1.0),
            A.GaussianBlur(blur_limit=(3, 5), p=1.0),
            A.MedianBlur(blur_limit=3, p=1.0),
        ], p=0.3),
        
        # Noise — simulate camera sensor noise
        A.OneOf([
            A.GaussNoise(var_limit=(10, 50), p=1.0),
            A.ISONoise(p=1.0),
        ], p=0.3),
        
        # Color/brightness — simulate lighting conditions
        A.OneOf([
            A.RandomBrightnessContrast(brightness_limit=0.2, contrast_limit=0.2, p=1.0),
            A.CLAHE(clip_limit=2.0, p=1.0),
            A.RandomGamma(gamma_limit=(80, 120), p=1.0),
        ], p=0.4),
        
        # Shadow simulation
        A.RandomShadow(
            shadow_roi=(0, 0, 1, 1),
            num_shadows_lower=1, num_shadows_upper=2,
            shadow_dimension=5, p=0.2
        ),
        
        # Paper texture simulation
        A.ImageCompression(quality_lower=70, quality_upper=95, p=0.3),
    ])


def get_validation_augmentation():
    """Minimal augmentation for validation — only resize/normalize."""
    if not HAS_ALBUMENTATIONS:
        raise ImportError("albumentations is required.")
    
    return A.Compose([
        # No augmentation for validation — just normalize
    ])


def augment_image(image: np.ndarray, augmentation=None) -> np.ndarray:
    """
    Apply augmentation to a single image.
    
    Args:
        image: Input image (BGR, uint8)
        augmentation: Albumentations Compose object. If None, uses training defaults.
    
    Returns:
        Augmented image
    """
    if augmentation is None:
        augmentation = get_training_augmentation()
    
    result = augmentation(image=image)
    return result['image']
