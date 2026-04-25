"""
TrOCR Fine-Tuning Script
Fine-tunes microsoft/trocr-base-handwritten on the BD Prescription dataset.
Dataset: https://www.kaggle.com/datasets/mamun1113/doctors-handwritten-prescription-bd-dataset
"""

import os
import torch
import pandas as pd
from torch.utils.data import Dataset, DataLoader
from PIL import Image
from transformers import (
    TrOCRProcessor,
    VisionEncoderDecoderModel,
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    default_data_collator,
)
import evaluate
from sklearn.model_selection import train_test_split


class PrescriptionDataset(Dataset):
    """
    Dataset for BD doctor's handwritten prescription word segments.
    
    Expected data format:
        - images/ directory containing word-segment images
        - labels CSV/XLSX with columns: image_path (or filename), text (medicine name)
    
    The Kaggle dataset has 4,680 word segments across 78 medicine classes.
    """
    
    def __init__(self, df, processor, image_dir, max_target_length=64):
        """
        Args:
            df: DataFrame with 'image_path' and 'text' columns
            processor: TrOCRProcessor instance
            image_dir: Root directory containing images
            max_target_length: Max token length for labels
        """
        self.df = df.reset_index(drop=True)
        self.processor = processor
        self.image_dir = image_dir
        self.max_target_length = max_target_length
    
    def __len__(self):
        return len(self.df)
    
    def __getitem__(self, idx):
        row = self.df.iloc[idx]
        
        # Handle both absolute and relative paths
        image_path = row['image_path']
        if not os.path.isabs(image_path):
            image_path = os.path.join(self.image_dir, image_path)
        
        text = str(row['text']).strip()
        
        # Load and process image
        image = Image.open(image_path).convert('RGB')
        pixel_values = self.processor(image, return_tensors='pt').pixel_values
        
        # Tokenize labels
        labels = self.processor.tokenizer(
            text,
            padding='max_length',
            max_length=self.max_target_length,
            truncation=True,
        ).input_ids
        
        # Replace padding token id's with -100 (ignored by CrossEntropyLoss)
        labels = [l if l != self.processor.tokenizer.pad_token_id else -100
                  for l in labels]
        
        return {
            'pixel_values': pixel_values.squeeze(),
            'labels': torch.tensor(labels),
        }


def compute_cer_metric(pred):
    """Compute Character Error Rate for evaluation."""
    cer_metric = evaluate.load('cer')
    
    labels_ids = pred.label_ids
    pred_ids = pred.predictions
    
    # Replace -100 with pad token id
    labels_ids[labels_ids == -100] = processor.tokenizer.pad_token_id
    
    pred_str = processor.batch_decode(pred_ids, skip_special_tokens=True)
    label_str = processor.batch_decode(labels_ids, skip_special_tokens=True)
    
    cer = cer_metric.compute(predictions=pred_str, references=label_str)
    return {'cer': cer}


def load_bd_prescription_dataset(data_dir: str):
    """
    Load the BD Prescription dataset.
    
    The dataset structure from Kaggle:
    - Contains word segments organized by medicine class folders
    - Or a CSV/XLSX mapping filenames to labels
    
    Args:
        data_dir: Path to extracted dataset
    
    Returns:
        DataFrame with columns: image_path, text
    """
    records = []
    
    # Check for CSV/XLSX files first
    for f in os.listdir(data_dir):
        if f.endswith('.csv'):
            df = pd.read_csv(os.path.join(data_dir, f))
            return df
        elif f.endswith('.xlsx'):
            df = pd.read_excel(os.path.join(data_dir, f))
            return df
    
    # Fallback: folder-based structure (class_name/image.png)
    for class_name in sorted(os.listdir(data_dir)):
        class_dir = os.path.join(data_dir, class_name)
        if not os.path.isdir(class_dir):
            continue
        
        for img_file in os.listdir(class_dir):
            if img_file.lower().endswith(('.png', '.jpg', '.jpeg', '.bmp', '.tiff')):
                records.append({
                    'image_path': os.path.join(class_name, img_file),
                    'text': class_name,
                })
    
    if not records:
        raise FileNotFoundError(
            f"No dataset found in {data_dir}. "
            "Ensure the Kaggle dataset is extracted properly."
        )
    
    return pd.DataFrame(records)


# ─── Main Training Script ────────────────────────────────────────────

if __name__ == '__main__':
    import argparse
    
    parser = argparse.ArgumentParser(description='Fine-tune TrOCR on BD Prescription dataset')
    parser.add_argument('--data_dir', type=str, required=True,
                        help='Path to extracted Kaggle dataset')
    parser.add_argument('--output_dir', type=str, default='./checkpoints/trocr_bd_prescription')
    parser.add_argument('--epochs', type=int, default=15)
    parser.add_argument('--batch_size', type=int, default=8)
    parser.add_argument('--learning_rate', type=float, default=5e-5)
    parser.add_argument('--max_length', type=int, default=64)
    parser.add_argument('--fp16', action='store_true', default=True)
    args = parser.parse_args()
    
    # Load dataset
    print(f"📂 Loading dataset from {args.data_dir}...")
    df = load_bd_prescription_dataset(args.data_dir)
    print(f"   Found {len(df)} samples across {df['text'].nunique()} classes")
    
    # Train/val split (stratified by medicine class)
    train_df, val_df = train_test_split(
        df, test_size=0.15, stratify=df['text'], random_state=42
    )
    print(f"   Train: {len(train_df)} | Val: {len(val_df)}")
    
    # Load TrOCR
    print("🔧 Loading TrOCR base model...")
    processor = TrOCRProcessor.from_pretrained('microsoft/trocr-base-handwritten')
    model = VisionEncoderDecoderModel.from_pretrained('microsoft/trocr-base-handwritten')
    
    # Configure decoder
    model.config.decoder_start_token_id = processor.tokenizer.cls_token_id
    model.config.pad_token_id = processor.tokenizer.pad_token_id
    model.config.vocab_size = model.config.decoder.vocab_size
    model.config.eos_token_id = processor.tokenizer.sep_token_id
    model.config.max_length = args.max_length
    model.config.early_stopping = True
    model.config.no_repeat_ngram_size = 3
    model.config.length_penalty = 2.0
    model.config.num_beams = 4
    
    # Create datasets
    train_dataset = PrescriptionDataset(train_df, processor, args.data_dir, args.max_length)
    val_dataset = PrescriptionDataset(val_df, processor, args.data_dir, args.max_length)
    
    # Training arguments
    training_args = Seq2SeqTrainingArguments(
        output_dir=args.output_dir,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=args.batch_size,
        per_device_eval_batch_size=args.batch_size,
        predict_with_generate=True,
        evaluation_strategy='epoch',
        save_strategy='epoch',
        load_best_model_at_end=True,
        metric_for_best_model='cer',
        greater_is_better=False,
        fp16=args.fp16 and torch.cuda.is_available(),
        dataloader_num_workers=4 if os.name != 'nt' else 0,
        learning_rate=args.learning_rate,
        weight_decay=0.01,
        warmup_steps=500,
        logging_steps=50,
        save_total_limit=3,
        report_to='none',
    )
    
    # Trainer
    trainer = Seq2SeqTrainer(
        model=model,
        tokenizer=processor.feature_extractor,
        args=training_args,
        train_dataset=train_dataset,
        eval_dataset=val_dataset,
        data_collator=default_data_collator,
        compute_metrics=compute_cer_metric,
    )
    
    # Train
    print("🚀 Starting fine-tuning...")
    trainer.train()
    
    # Save best model
    trainer.save_model(os.path.join(args.output_dir, 'best_model'))
    processor.save_pretrained(os.path.join(args.output_dir, 'best_model'))
    print(f"✅ Training complete. Best model saved to {args.output_dir}/best_model")
