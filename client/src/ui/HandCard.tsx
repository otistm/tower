import { CARD_CATALOG, SIZE_FOOTPRINT } from "@tower/shared";
import { dragController } from "./board/dragController";
import { CardFace } from "./CardFace";

interface HandCardProps {
  instanceId: string;
  defId: string;
  tier: number;
  unit: number;
}

/**
 * A card in the player's hand carousel. Drag onto the board to place it; tap to
 * inspect. The shared drag controller decides tap vs. drag from a movement
 * threshold and routes a tap to the inspector (so a click never places a card).
 */
export function HandCard({ instanceId, defId, tier, unit }: HandCardProps) {
  const def = CARD_CATALOG[defId];
  const { w, h } = def ? SIZE_FOOTPRINT[def.size] : { w: 1, h: 1 };

  const onPointerDown = (e: React.PointerEvent) => {
    dragController.begin(e, {
      instanceId,
      defId,
      tier,
      w,
      h,
      location: "hand",
      sourceEl: e.currentTarget as HTMLElement,
      owned: true,
    });
  };

  return (
    <div className="hand-card" onPointerDown={onPointerDown}>
      <CardFace defId={defId} tier={tier} unit={unit} />
    </div>
  );
}
