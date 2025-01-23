import os
import json
import pyspark
import logging
from pyspark.sql import SparkSession
from pyspark.sql.functions import explode, lit, col, to_date
from tqdm import tqdm
from typing import List
from constants import DATA_FOLDER

logging.basicConfig(
   level=logging.INFO,
   format='%(asctime)s - %(levelname)s - %(message)s',
   handlers=[
       logging.FileHandler('data_wrangling.log'),
       logging.StreamHandler()
   ]
)
logger = logging.getLogger(__name__)

SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
RAW_DATA_PATH = os.path.join(SCRIPT_DIR, "raw_data")

spark = SparkSession.builder \
   .master("local[*]") \
   .appName("Trenitalia") \
   .config("spark.driver.memory", "16g") \
   .config("spark.executor.memory", "16g") \
   .config("spark.ui.showConsoleProgress", "false") \
   .config("spark.hadoop.security.manager", "false") \
   .getOrCreate()

sc = spark.sparkContext
logger.info("SparkSession successfully started")

columns_mapper = {
   "a": "train_arrival_stop_name", 
   "c": "train_class",
   "cn": "train_cn",
   "dl": "train_dl",
   "fr": "stops",
   "n": "train_number",
   "oa": "train_arrival_time",
   "oaz": "train_oaz",
   "od": "train_od",
   "oo": "train_oo",
   "op": "train_departure_time",
   "ope": "train_ope",
   "opz": "train_opz",
   "p": "train_departure_stop_name",
   "pr": "train_pr",
   "ra": "train_arrival_delay",
   "rp": "train_departure_delay",
   "sep": "train_sep",
   "sub": "train_sub"
}

stops_columns_mapper = {
   "n": "stop_name",
   "oa": "stop_arrival_time",
   "op": "stop_departure_time",
   "ra": "stop_arrival_delay",
   "rp": "stop_departure_delay"
}

def get_date_from_file_name(file_name: str) -> str:
   try:
       date = file_name.split("_")[1:]
       date = "_".join(date)
       date = date.split(".")[0]
       day, month, year = date.split("_")
       return f"{year}-{month}-{day}"
   except Exception as e:
       logger.error(f"Failed to parse date from filename {file_name}: {str(e)}")
       raise

def get_available_files() -> List[str]:
   try:
       if not os.path.exists(RAW_DATA_PATH):
           raise FileNotFoundError(f"Raw data directory not found: {RAW_DATA_PATH}")
       
       all_files = [f for f in os.listdir(RAW_DATA_PATH) if f.endswith('.json')]
       if not all_files:
           raise FileNotFoundError(f"No JSON files found in {RAW_DATA_PATH}")
           
       all_files.sort(key=lambda x: get_date_from_file_name(x))
       logger.info(f"Found {len(all_files)} JSON files")
       return all_files
   except Exception as e:
       logger.error(f"Failed to get available files: {str(e)}")
       raise

def read_preprocess_daily_dataset(file_name: str) -> pyspark.sql.DataFrame:
   try:
       file_path = os.path.join(RAW_DATA_PATH, file_name)
       logger.info(f"Processing file: {file_name}")
       
       df = spark.read.option("multiline","true").json(file_path)
       date = df.select("giorno").first().asDict()["giorno"]
       day, month, year = date.split("/")

       trains = df.select("treni")
       trains = trains.select(explode("treni").alias("treni")).select("treni.*")

       for k, v in columns_mapper.items():
           trains = trains.withColumnRenamed(k, v)
       
       df = trains.select("*", explode("stops").alias("stops_extracted")) \
                 .drop("stops") \
                 .select("*", "stops_extracted.*") \
                 .drop("stops_extracted")
       
       for k, v in stops_columns_mapper.items():
           df = df.withColumnRenamed(k, v)

       df = df.withColumn("day", lit(day)) \
             .withColumn("month", lit(month)) \
             .withColumn("year", lit(year)) \
             .withColumn("date", lit(date))
       df = df.withColumn("date", to_date("date", "dd/MM/yyyy"))

       return df

   except Exception as e:
       logger.error(f"Failed to process file {file_name}: {str(e)}")
       raise

def main():
   try:
       files = get_available_files()
       logger.info(f"First file: {files[0]}")
       logger.info(f"Last file: {files[-1]}")

       combined_df = read_preprocess_daily_dataset(files[0])
       
       for file in tqdm(files[1:]):
           current_df = read_preprocess_daily_dataset(file)
           combined_df = combined_df.unionByName(current_df, allowMissingColumns=True)

       parquet_dir = os.path.join(SCRIPT_DIR, "parquet")
       os.makedirs(parquet_dir, exist_ok=True)
       
       combined_df.write.mode("overwrite").parquet(os.path.join(parquet_dir, "all.parquet"))
       logger.info("Processing complete")

   except Exception as e:
       logger.error(f"Main execution failed: {str(e)}")
       raise

if __name__ == "__main__":
   try:
       main()
   except Exception as e:
       logger.error(f"Process failed: {str(e)}")
       raise