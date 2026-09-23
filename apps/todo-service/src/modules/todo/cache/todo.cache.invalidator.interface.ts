export interface TodoCacheInvalidator {
  invalidateOwner(
    ownerId: string,
  ): Promise<void>;
}