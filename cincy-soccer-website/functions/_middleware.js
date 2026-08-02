export async function onRequest(context) {
    const url = new URL(context.request.url);
    
    // Redirect *.pages.dev and www.cincinnati.soccer to primary domain https://cincinnati.soccer
    if (url.hostname === 'cincinnati-soccer.pages.dev' || url.hostname === 'www.cincinnati.soccer') {
        url.hostname = 'cincinnati.soccer';
        url.protocol = 'https:';
        return Response.redirect(url.toString(), 301);
    }
    
    return await context.next();
}
