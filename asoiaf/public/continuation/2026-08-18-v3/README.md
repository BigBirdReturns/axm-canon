# ASOIAF public continuation wave v3

This directory admits the **custody manifest** for the sealed 2026-08-18 v3 continuation wave. It does not claim that the source archive or its nineteen delivery files are stored in this repository.

The controlling source archive is `asoiaf-continuation-wave-2026-08-18-v3.tar.zst`, identified by SHA-256 `0e999b7f8c921e7e81d439fc4c2fc1fd004a2b4a2adb375f0df3b99aefe92ab9`. Independent replay, control, and delivery-ledger digests are recorded in `ADMISSION.json`. The manifest reports seven governed components, nine of nine live checks, nine of nine archive-replay checks, and zero automatic canon promotions.

The distinction between **identified**, **sealed**, **manifest-admitted**, and **payload-materialized** is mandatory. A recorded digest does not prove that bytes are present in the Git tree. Accordingly, every component in this directory remains marked `payloadMaterialized: false` until an exact-file admission transaction verifies the source archive and its inventory inside repository custody.

The wave does not close the private v4.1 hold. Integrated v4.2 remains unbuilt and unclaimed until the exact inherited archive is materialized at 244,436,743 bytes and SHA-256 `48428ec5630971e75d0f9e0075b4d7fecacdfd2e61efc516ed01c3aaa17fb9d7`.
