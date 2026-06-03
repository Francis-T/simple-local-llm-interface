class AppData:
    def __init__(self):
        self.loaded_model = None
        self.state = "STOPPED"

    def is_model_loaded(self):
        if self.loaded_model is None:
            return False

        return True

    def get_state(self):
        return self.state

    def start_model(self):
        self.state = "STARTED"

    def idle_model(self):
        self.state = "IDLE"

    def stop_model(self):
        self.state = "STOPPED"

app_data = AppData()
