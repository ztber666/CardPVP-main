import { PlayCardResult } from "../gameEngine";
import { ActiveBuff, CostType, EffectDef, GameState } from "../types";

class Card {

    id: number;
    name: string;
    icon: number[];
    costType: CostType;
    effects: EffectDef[];
    buffs: ActiveBuff[];
    description: string;
    weight: number;
    defaultTarget: 'self' | 'opponent' | 'all';

    constructor(id: number, name: string, icon: number[], costType: CostType, effects: EffectDef[], buffs: ActiveBuff[], description: string, weight: number, defaultTarget: 'self' | 'opponent' | 'all') {
        this.id = id;
        this.name = name;
        this.icon = icon;
        this.costType = costType;
        this.effects = effects;
        this.buffs = buffs;
        this.description = description;
        this.weight = weight;
        this.defaultTarget = defaultTarget;
    }

    play(
        gameState: GameState,
        playerId: string,
        targetId: string
    ): PlayCardResult {
        return {
            success: true,
            gameState: gameState
        };
    }

    public onDraw(): void {}

    public onDiscard(): void {}

    public onTurnStart(): void {}

    public onTurnEnd(): void {}

    public onEquip(): void {}

    public onUnequip(): void {}

}
