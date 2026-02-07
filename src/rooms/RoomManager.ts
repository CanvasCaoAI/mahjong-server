import { Table } from '../game/Table';

export class RoomManager {
  private rooms = new Map<string, Table>();

  constructor(private ttlMs: number) {}

  get(roomId: string): Table {
    let t = this.rooms.get(roomId);
    if (!t) {
      t = new Table();
      this.rooms.set(roomId, t);
    }
    return t;
  }

  cleanup() {
    const now = Date.now();
    for (const [id, table] of this.rooms.entries()) {
      if (now - table.lastActiveMs > this.ttlMs) {
        this.rooms.delete(id);
      }
    }
  }
}
