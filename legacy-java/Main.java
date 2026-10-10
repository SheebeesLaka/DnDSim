
import UI.AppController;
import javafx.application.Application;
import javafx.stage.Stage;

public class Main extends Application {

    @Override
    public void start(Stage primaryStage) {
        AppController.initialize(primaryStage);
        AppController.getInstance().show();
    }

    public static void main(String[] args) {
        launch(args);
    }
}
