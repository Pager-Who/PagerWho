-- CreateTable
CREATE TABLE "copilot_document_chunks" (
    "id" UUID NOT NULL,
    "source_path" TEXT NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "snippet" TEXT NOT NULL,
    "search_text" TEXT NOT NULL,
    "content_hash" TEXT NOT NULL,
    "embedding" JSONB,
    "embedding_model" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "copilot_document_chunks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "copilot_document_chunks_source_path_chunk_index_key" ON "copilot_document_chunks"("source_path", "chunk_index");

-- CreateIndex
CREATE INDEX "copilot_document_chunks_source_path_idx" ON "copilot_document_chunks"("source_path");

-- CreateIndex
CREATE INDEX "copilot_document_chunks_content_hash_idx" ON "copilot_document_chunks"("content_hash");

-- CreateIndex
CREATE INDEX "copilot_document_chunks_embedding_model_idx" ON "copilot_document_chunks"("embedding_model");
