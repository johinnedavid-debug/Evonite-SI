"""
memory/vector_store.py — ChromaDB-backed vector store for long-term agent memory.
"""

import json
import uuid
from typing import Any, Dict, List, Optional

import chromadb
from chromadb.config import Settings

import config
from utils.logging import get_logger

logger = get_logger(__name__)

# Use Any to avoid chromadb.Collection type at import time
_Collection = Any


class VectorStore:
    """
    Thin wrapper around a ChromaDB persistent client.

    Each logical "namespace" maps to a ChromaDB collection so that
    experiences, skills, and per-agent memories stay separated.
    """

    def __init__(self) -> None:
        self._client = chromadb.PersistentClient(
            path=str(config.MEMORY_DIR),
            settings=Settings(anonymized_telemetry=False),
        )
        # Pre-create the standard collections
        self._collections: Dict[str, _Collection] = {}
        for name in [
            config.CHROMA_COLLECTION_EXPERIENCES,
            config.CHROMA_COLLECTION_SKILLS,
            config.CHROMA_COLLECTION_AGENT_MEMORY,
        ]:
            self._collections[name] = self._client.get_or_create_collection(name)
        logger.info("VectorStore initialised at %s", config.MEMORY_DIR)

    # ── Internal helpers ──────────────────────────────────────────────────────

    def _col(self, collection: str) -> Any:
        if collection not in self._collections:
            self._collections[collection] = self._client.get_or_create_collection(collection)
        return self._collections[collection]

    # ── Write ─────────────────────────────────────────────────────────────────

    def upsert(
        self,
        collection: str,
        text: str,
        metadata: Optional[Dict[str, Any]] = None,
        doc_id: Optional[str] = None,
    ) -> str:
        """
        Insert or update a document in *collection*.

        Args:
            collection: Collection name.
            text:       Raw text content (will be embedded automatically by Chroma).
            metadata:   Optional flat key-value metadata.
            doc_id:     Explicit ID; generated if omitted.

        Returns:
            The document ID.
        """
        doc_id = doc_id or str(uuid.uuid4())
        meta = metadata or {}
        # ChromaDB requires all metadata values to be str/int/float/bool
        safe_meta = {
            k: (json.dumps(v) if isinstance(v, (dict, list)) else v)
            for k, v in meta.items()
        }
        self._col(collection).upsert(
            ids=[doc_id],
            documents=[text],
            metadatas=[safe_meta],
        )
        logger.debug("Upserted doc %s into '%s'", doc_id, collection)
        return doc_id

    def delete(self, collection: str, doc_id: str) -> None:
        self._col(collection).delete(ids=[doc_id])
        logger.debug("Deleted doc %s from '%s'", doc_id, collection)

    # ── Read ──────────────────────────────────────────────────────────────────

    def query(
        self,
        collection: str,
        query_text: str,
        n_results: int = 5,
        where: Optional[Dict[str, Any]] = None,
    ) -> List[Dict[str, Any]]:
        """
        Semantic search inside *collection*.

        Args:
            collection:  Collection name.
            query_text:  Natural-language query.
            n_results:   Max results to return.
            where:       Optional Chroma metadata filter.

        Returns:
            List of dicts with keys: id, text, metadata, distance.
        """
        col = self._col(collection)
        count = col.count()
        if count == 0:
            return []

        n_results = min(n_results, count)
        kwargs: Dict[str, Any] = {
            "query_texts": [query_text],
            "n_results": n_results,
        }
        if where:
            kwargs["where"] = where

        res = col.query(**kwargs)
        results = []
        for i, doc_id in enumerate(res["ids"][0]):
            results.append({
                "id": doc_id,
                "text": res["documents"][0][i],
                "metadata": res["metadatas"][0][i] if res["metadatas"] else {},
                "distance": res["distances"][0][i] if res["distances"] else None,
            })
        return results

    def get(self, collection: str, doc_id: str) -> Optional[Dict[str, Any]]:
        """Fetch a single document by ID."""
        res = self._col(collection).get(ids=[doc_id], include=["documents", "metadatas"])
        if not res["ids"]:
            return None
        return {
            "id": res["ids"][0],
            "text": res["documents"][0],
            "metadata": res["metadatas"][0] if res["metadatas"] else {},
        }

    def list_all(self, collection: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Return up to *limit* documents from *collection*."""
        col = self._col(collection)
        count = col.count()
        if count == 0:
            return []
        res = col.get(limit=min(limit, count), include=["documents", "metadatas"])
        results = []
        for i, doc_id in enumerate(res["ids"]):
            results.append({
                "id": doc_id,
                "text": res["documents"][i],
                "metadata": res["metadatas"][i] if res["metadatas"] else {},
            })
        return results

    def collection_count(self, collection: str) -> int:
        return self._col(collection).count()
