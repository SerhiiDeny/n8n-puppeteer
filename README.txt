SEC-03.11 / T-31 - PDF decoupling completed and accepted

The root Dockerfile is RETIRED. It is retained as historical rollback source
and is no longer used to build Railway Primary.

Railway Primary runs the stock image n8nio/n8n:1.123.5.
The live private PDF rendering service is defined in pdf-renderer/.
Its Dockerfile, dependencies, server and deployment instructions are there.
WF-QE-05 calls http://pdf-renderer.railway.internal:8080/render using the
owner-managed PDF Render Key credential.

Do not reconnect Primary to this repository's root Dockerfile.
The legacy image can be rebuilt from commit
c8d472cdfcc153f505feaf297584aa2997f47fbc for emergency rollback.
A future n8n version upgrade is tracked separately as T-32.
