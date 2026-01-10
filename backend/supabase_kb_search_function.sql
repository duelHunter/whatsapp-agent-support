-- Optional: Create a Postgres function for efficient vector similarity search
-- This function uses pgvector's cosine distance operator (<=>) for better performance
-- Run this in your Supabase SQL Editor to enable efficient KB search

-- First, ensure the pgvector extension is enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Function to search KB chunks using vector similarity
CREATE OR REPLACE FUNCTION search_kb_chunks(
  query_embedding vector(768),
  match_threshold float DEFAULT 0.0,
  match_count int DEFAULT 10,
  filter_org_id uuid DEFAULT NULL,
  filter_wa_account_id uuid DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  text text,
  chunk_index integer,
  title text,
  wa_account_id uuid,
  similarity float,
  metadata jsonb
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.text,
    c.chunk_index,
    s.title,
    s.wa_account_id,
    1 - (c.embedding <=> query_embedding) AS similarity,  -- Cosine distance (<=>) converted to similarity
    c.metadata
  FROM kb_chunks c
  INNER JOIN kb_sources s ON c.source_id = s.id
  WHERE
    s.status = 'ready'
    AND (filter_org_id IS NULL OR s.org_id = filter_org_id)
    AND (filter_wa_account_id IS NULL OR s.wa_account_id = filter_wa_account_id)
    AND (1 - (c.embedding <=> query_embedding)) >= match_threshold
  ORDER BY c.embedding <=> query_embedding  -- Order by cosine distance (ascending = most similar)
  LIMIT match_count;
END;
$$;

-- Create an index on the embedding column for faster vector searches
-- This is important for performance with large knowledge bases
CREATE INDEX IF NOT EXISTS kb_chunks_embedding_idx ON kb_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);  -- Adjust 'lists' based on your data size (rule of thumb: lists = rows / 1000)

-- Note: The ivfflat index requires at least some data to be present.
-- If you get an error, insert a few chunks first, then create the index.

