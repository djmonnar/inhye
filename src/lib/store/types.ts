import type {
  AppUser,
  BulkProductRow,
  Member,
  MemberInput,
  MoveInput,
  Product,
  ProductInput,
  Role,
  StockMove,
  Supplier,
  SupplierInput,
} from "../types";

export interface DataStore {
  mode: "supabase" | "demo";

  getUser(): Promise<AppUser | null>;
  signIn(id: string, password: string, remember: boolean): Promise<AppUser>;
  signOut(): Promise<void>;
  onAuthChange(cb: () => void): () => void;

  listProducts(): Promise<Product[]>;
  saveProduct(input: ProductInput, id?: string): Promise<Product>;
  deleteProduct(id: string): Promise<void>;
  bulkSaveProducts(rows: BulkProductRow[]): Promise<{ created: number; updated: number }>;
  markKioskSynced(ids: string[]): Promise<void>;

  listSuppliers(): Promise<Supplier[]>;
  saveSupplier(input: SupplierInput, id?: string): Promise<Supplier>;
  deleteSupplier(id: string): Promise<void>;

  /** Newest first. Without productId returns recent moves across all products. */
  listMoves(productId?: string, limit?: number): Promise<StockMove[]>;
  addMove(input: MoveInput): Promise<number>;

  uploadImage(file: Blob): Promise<string>;
  removeImage(path: string): Promise<void>;
  imageUrl(path: string | null | undefined): string | null;

  listMembers(): Promise<Member[]>;
  createMember(input: MemberInput): Promise<void>;
  updateMember(id: string, patch: { role?: Role; password?: string; display_name?: string }): Promise<void>;
  deleteMember(id: string): Promise<void>;
}

export class StoreError extends Error {}
