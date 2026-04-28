"""
Download Datasets Script
Uses the Kaggle API to download necessary datasets for the MedScript ML pipeline.
"""
import os
import subprocess
import zipfile

def download_dataset(dataset_name: str, output_dir: str):
    print(f"Downloading dataset: {dataset_name}")
    os.makedirs(output_dir, exist_ok=True)
    
    try:
        # Check if kaggle command is available
        subprocess.run(['kaggle', '--version'], check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    except (subprocess.CalledProcessError, FileNotFoundError):
        print("Error: Kaggle CLI is not installed or configured.")
        print("Please ensure you have run 'pip install kaggle' and have your kaggle.json in ~/.kaggle/")
        return False
        
    try:
        # Download dataset
        subprocess.run([
            'kaggle', 'datasets', 'download', '-d', dataset_name, '-p', output_dir
        ], check=True)
        
        # Unzip files
        zip_file = os.path.join(output_dir, f"{dataset_name.split('/')[-1]}.zip")
        if os.path.exists(zip_file):
            print(f"Extracting {zip_file}...")
            with zipfile.ZipFile(zip_file, 'r') as zip_ref:
                zip_ref.extractall(output_dir)
            os.remove(zip_file)
            print(f"Successfully downloaded and extracted {dataset_name} to {output_dir}")
            return True
        else:
            print(f"Failed to find downloaded zip file for {dataset_name}")
            return False
            
    except subprocess.CalledProcessError as e:
        print(f"Failed to download {dataset_name}. Ensure kaggle.json is configured correctly.")
        print(e)
        return False

if __name__ == "__main__":
    base_data_dir = os.path.join(os.path.dirname(os.path.abspath(__file__)), "data")
    
    # OCR Dataset
    ocr_dataset = "mamun1113/doctors-handwritten-prescription-bd-dataset"
    ocr_dir = os.path.join(base_data_dir, "ocr_dataset")
    
    # DDI Dataset
    ddi_dataset = "shayanhusain/200-ddi-datasetseveritymechanisms-and-alternative"
    ddi_dir = os.path.join(base_data_dir, "ddi_dataset")
    
    print("--- MedScript Dataset Downloader ---")
    download_dataset(ocr_dataset, ocr_dir)
    print("-" * 30)
    download_dataset(ddi_dataset, ddi_dir)
    print("Done!")
