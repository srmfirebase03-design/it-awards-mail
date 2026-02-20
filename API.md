# Awards Nomination Mailer API Documentation

This project provides a backend API to process award nominations from an Excel sheet and send automated document request emails.

## Base URL
`http://localhost:3001` (Local Development)

## Endpoints

### 1. Fetch Nominees
*   **Endpoint:** `GET /api/nominees`
*   **Description:** Processes the nomination Excel file, maps awards to faculty representatives and supporting documents, and identifies the correct nomination form.
*   **Response:**
    ```json
    [
      {
        "id": "string",
        "name": "string",
        "email": "string",
        "award": "string",
        "regNo": "string",
        "scrutinyMembers": ["string"],
        "supportingDocuments": ["string"],
        "formLink": "string | null"
      }
    ]
    ```

### 2. Send Nomination Email
*   **Endpoint:** `POST /api/send-email`
*   **Description:** Sends a personalized email to a nominee with document requirements and a download link.
*   **Request Body:**
    ```json
    {
      "nominee": {
        "id": "string",
        "name": "string",
        "email": "string",
        "award": "string",
        "scrutinyMembers": ["string"],
        "supportingDocuments": ["string"],
        "formLink": "string"
      }
    }
    ```
*   **Response:** `{"success": true}`

### 3. Send Test Email (Hardcoded)
*   **Endpoint:** `POST /api/test-email`
*   **Description:** Sends a sample email for "Sharvani B" to the provided address.
*   **Request Body:** `{"email": "string"}`
*   **Response:** `{"success": true, "message": "..."}`

### 4. Custom Debug Email
*   **Endpoint:** `POST /api/debug-email`
*   **Description:** Sends a custom test email to a specific address with a specific award to verify mapping and template rendering.
*   **Request Body:**
    ```json
    {
      "email": "your-email@example.com",
      "award": "Best Coder Award",
      "name": "Your Name (Optional)"
    }
    ```
*   **Response:**
    ```json
    {
      "success": true, 
      "message": "...",
      "context": {
        "scrutinyMembers": ["..."],
        "supportingDocuments": ["..."],
        "formLink": "..."
      }
    }
    ```

## Static Assets
*   **Nomination Forms:** Accessible via `GET /forms/:filename`
