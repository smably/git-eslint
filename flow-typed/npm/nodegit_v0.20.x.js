declare module 'nodegit' {
  declare class DiffLine {
    oldLineno(): number,
    newLineno(): number,
  }

  declare class ConvenientHunk {
    lines(): Promise<Array<DiffLine>>,
    header(): string,
  }

  declare class DiffFile {
    mode(): number,
    path(): string,
  }

  declare class ConvenientPatch {
    hunks(): Promise<Array<ConvenientHunk>>,
    isAdded(): boolean,
    isDeleted(): boolean,
    isModified(): boolean,
    isRenamed(): boolean,
    isUntracked(): boolean,
    newFile(): DiffFile,
    oldFile(): DiffFile,
    size(): number,
  }

  declare class Status {
    static OPT: {
      INCLUDE_UNTRACKED: number,
      RECURSE_UNTRACKED_DIRS: number,
      RENAMES_INDEX_TO_WORKDIR: number,
      RENAMES_HEAD_TO_INDEX: number,
    },

    static STATUS: {
      CURRENT: number,
      INDEX_NEW: number,
      INDEX_MODIFIED: number,
      INDEX_DELETED: number,
      INDEX_RENAMED: number,
      INDEX_TYPECHANGE: number,
      WT_NEW: number,
      WT_MODIFIED: number,
      WT_DELETED: number,
      WT_TYPECHANGE: number,
      WT_RENAMED: number,
      WT_UNREADABLE: number,
      IGNORED: number,
      CONFLICTED: number,
    },

    static file(repo: Repository, path: string): number,
  }

  declare class Diff {
    static indexToWorkdir(repo: Repository, index: Index, options: ?Object): Promise<Diff>,
    static treeToIndex(repo: Repository, tree: ?Tree, index: ?Index, options: ?Object): Promise<Diff>,
    static treeToTree(repo: Repository, oldTree: ?Tree, newTree: ?Tree, options: ?Object): Promise<Diff>,
    static treeToWorkdir(repo: Repository, tree: ?Tree, options: ?Object): Promise<Diff>,
    static treeToWorkdirWithIndex(repo: Repository, tree: ?Tree, options: ?Object): Promise<Diff>,

    static OPTION: { SHOW_UNTRACKED_CONTENT: number, RECURSE_UNTRACKED_DIRS: number },
    static FIND: { RENAMES: number, FOR_UNTRACKED: number },

    patches(): Promise<Array<ConvenientPatch>>,

    findSimilar(options: ?Object): Promise<number>,
  }

  declare class Oid {}

  declare class IndexEntry {
    id: Oid,
    mode: number,
    path: string,
    fileSize: number,
    flags: number,
    flagsExtended: number,
  }

  declare class Index {
    removeByPath(path: string): number,
    addByPath(path: string): number,
    add(entry: IndexEntry): number,

    getByPath(path: string, stage?: number): ?IndexEntry,

    write(): Promise<number>,
    writeTree(): Promise<Oid>,
  }

  declare class TreeEntry {
    getBlob(): Promise<Blob>,
    id(): Oid,
  }

  declare class Tree {
    getEntry(path: string): Promise<TreeEntry>,
  }

  declare class Commit {
    getTree(): Promise<Tree>,
    getEntry(path: string): Promise<TreeEntry>,
    id(): Oid,
  }

  declare class Object {
    id(): Oid,
  }

  declare class Blob {
    toString(): string,
  }

  declare class StatusFile {
    path(): string,

    headToIndex(): DiffDelta,
    indexToWorkdir(): DiffDelta,

    isDeleted(): boolean,
    isRenamed(): boolean,
  }

  declare class DiffDelta {
    newFile(): DiffFile,
    oldFile(): DiffFile,
  }

  declare class StatusEntry {
    headToIndex(): DiffDelta,
    indexToWorkdir(): DiffDelta,
  }

  declare class Reset {
    static default(repo: Repository, target: Commit, path: string): Promise<number>,
  }

  declare class Signature {
    static default(repo: Repository): Signature,
  }

  declare class Repository {
    static open(path: string): Promise<Repository>,
    static openExt(path: ?string, flags: number, ceiling_dirs: string): Promise<Repository>,

    index(): Promise<Index>,

    isEmpty(): boolean,

    workdir(): string,

    getHeadCommit(): Promise<Commit>,
    getCommit(sha: Oid | string): Promise<Commit>,

    getBlob(id: Oid | string): Promise<Blob>,

    createBlobFromBuffer(buf: Buffer): Oid,
    createCommit(
      updateRef: string,
      author: Signature,
      committer: Signature,
      message: string,
      oid: Oid,
      parents: ?Array<Commit>,
    ): Promise<Oid>,

    getStatusExt(): Promise<Array<StatusFile>>,
  }

  declare class Revparse {
    static single(repo: Repository, spec: string): { // FIXME can't use Object directly?
      id(): Oid,
    },
  }

  declare class Merge {
    static base(repo: Repository, one: Oid, two: Oid): Promise<Oid>,
  }
}
