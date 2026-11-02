export async function api (url, method = "GET", body = null) {
    const response = await fetch(url, {method, headers: {'Content-Type': 'application/json'}, 
        body : body ? JSON.stringify(body) : null})
    let data = null;
    try{
        data = await response.json();
    } catch (error) {
    }
    return { ok: response.ok, status: response.status, data };
}
