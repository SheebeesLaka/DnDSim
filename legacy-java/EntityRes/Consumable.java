package EntityRes;

public class Consumable extends Item {

    private int healAmount;
    private Status effect;

    public Consumable(String name, String type, String color, int healAmount, Status effect) {
        super(name, type, color);
        this.healAmount = healAmount;
        this.effect = effect;
    }

    public Consumable(String name, String type, int color, int healAmount, Status effect) {
        this(name, type, ColorUtils.fromLegacyIndex(color), healAmount, effect);
    }

    public Consumable(String name, String type, int healAmount, Status effect) {
        super(name, type);
        this.healAmount = healAmount;
        this.effect = effect;
    }

    public int getHealAmount() {
        return healAmount;
    }

    public Status getEffect() {
        return effect;
    }

    public void setHealAmount(int healAmount) {
        this.healAmount = healAmount;
    }

    public void setEffect(Status effect) {
        this.effect = effect;
    }
    
}
