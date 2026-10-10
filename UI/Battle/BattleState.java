package UI.Battle;

import javafx.beans.property.*;

/**
 * Observable battle-level flags shared by the battle UI.
 * Turn order, rounds and the current combatant live in TurnManager;
 * the selected unit lives in BattleGridCanvas.
 */
public class BattleState {

    // Whether initiative has been rolled and the battle is underway; UI controls bind to this
    private final BooleanProperty battleStarted = new SimpleBooleanProperty(false);

    // Enemies defeated this battle; any defeat counts the battle as a victory on End
    private final IntegerProperty enemiesDefeated = new SimpleIntegerProperty(0);

    // ===== BATTLE STATUS =====

    public boolean isBattleStarted() { return battleStarted.get(); }
    public void setBattleStarted(boolean value) { battleStarted.set(value); }
    public BooleanProperty battleStartedProperty() { return battleStarted; }

    // ===== STATISTICS =====

    public int getEnemiesDefeated() { return enemiesDefeated.get(); }
    public void incrementEnemiesDefeated() { enemiesDefeated.set(enemiesDefeated.get() + 1); }
    public IntegerProperty enemiesDefeatedProperty() { return enemiesDefeated; }
}
