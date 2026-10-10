package Objects;

import EntityRes.Item;

public class Pickup extends GridObject {

    private final Item item;

    public Pickup(int row, int col, Item item) {
        super(row, col);
        this.item = item;
    }

    public Item getItem() {
        return item;
    }
}
