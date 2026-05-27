from ultralytics import YOLO

model = YOLO("yolo11n.pt")

def main():
    results = model.train(
        data = "dataset_v2/data.yaml",
        epochs = 30,
        imgsz = 640,
        batch = 16, 
        name = "placas_colombianas",
        device= "cpu",
        workers= 2
    )

    print("...Entrenamiento completado!")

if __name__=='__main__':
    main()