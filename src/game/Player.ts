export type Seat = 0 | 1 | 2 | 3;

export class Player {
  constructor(
    public readonly id: string,
    public readonly seat: Seat,
    public name: string,
    public ready: boolean = false
  ) {}
}
