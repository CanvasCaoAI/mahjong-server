export type Seat = 0 | 1 | 2 | 3;

export class Player {
  // clientId persists across refreshes, socketId changes on reconnect
  constructor(
    public readonly clientId: string,
    public socketId: string,
    public readonly seat: Seat,
    public name: string,
    public ready: boolean = false,
    public online: boolean = true,
    public lastSeenMs: number = Date.now(),
  ) {}
}
