package EntityRes;

public class Ammunition extends Item {

    private String ammoType;  // e.g., "12 Gauge", "Arrow", "Bolt"
    
    // Legacy field for backward compatibility
    private int damageBonus;
    private String compatibleWeaponType;

    public Ammunition(String name, String type, String color, String ammoType) {
        super(name, type, color);
        this.ammoType = ammoType;
    }

    public Ammunition(String name, String type, int color, String ammoType) {
        this(name, type, ColorUtils.fromLegacyIndex(color), ammoType);
    }

    public Ammunition(String name, String ammoType) {
        super(name, "Ammunition", ColorUtils.fromLegacyIndex(5));
        this.ammoType = ammoType;
    }

    public String getAmmoType() {
        // Handle legacy format
        if (ammoType == null && compatibleWeaponType != null) {
            return compatibleWeaponType;
        }
        return ammoType != null ? ammoType : "Any";
    }

    public void setAmmoType(String ammoType) {
        this.ammoType = ammoType;
    }

    // Legacy methods for backward compatibility
    @Deprecated
    public int getDamageBonus() {
        return damageBonus;
    }

    @Deprecated
    public void setDamageBonus(int damageBonus) {
        this.damageBonus = damageBonus;
    }

    @Deprecated
    public String getCompatibleWeaponType() {
        return getAmmoType();
    }

    @Deprecated
    public void setCompatibleWeaponType(String compatibleWeaponType) {
        this.ammoType = compatibleWeaponType;
    }

    public boolean isCompatibleWith(Weapon weapon) {
        String weaponAmmoType = weapon.getAmmoType();
        if (weaponAmmoType == null || ammoType == null) {
            return false;  // Melee weapons don't use ammo
        }
        if (ammoType.equals("Any") || weaponAmmoType.equals("Any")) {
            return true;
        }
        return ammoType.equalsIgnoreCase(weaponAmmoType);
    }
}
